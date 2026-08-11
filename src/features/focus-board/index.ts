import type { Feature } from '../../shared/feature';
import { getSettings } from '../../shared/storage';
import { getBoard, rolloverIfNewDay, stopTimer } from './store';
import { formatBadge, isSessionOver, runSeconds, sessionEndsAt, sessionRemaining } from './timer';
import {
  applyNetworkRules,
  clearNetworkRules,
  divertTab,
  isGuardedUrl,
  normaliseSites,
} from './blocker';

const TICK_ALARM = 'focus-board-tick';
const END_ALARM = 'focus-board-session-end';
const RUNNING_COLOR = '#4f8cff';
const DONE_COLOR = '#2e9e5b';

export const focusBoardFeature: Feature = {
  id: 'focus-board',
  async onInstall() {},
  async onEnable() {
    // 1 minute is the finest period MV3 grants a packed extension, which is
    // also all the badge needs — it only ever shows whole minutes.
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
    await reconcile();
  },
  async onDisable() {
    await chrome.alarms.clear(TICK_ALARM);
    await chrome.alarms.clear(END_ALARM);
    await clearNetworkRules();
    await clearBadge();
  },
};

export const focusBoardHandlers = {
  async onAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name === TICK_ALARM) {
      const settings = await getSettings();
      if (!settings.enabled['focus-board']) return;
      await rolloverIfNewDay(settings.focusBoard.autoRollover);
      await reconcile();
      return;
    }
    if (alarm.name === END_ALARM) {
      // Session served its time: bank it, drop the rules, show the tick.
      await stopTimer();
      await reconcile();
      await setBadge('✓', DONE_COLOR);
    }
  },

  /** Every focusBoard write lands here, so blocking tracks start/stop instantly. */
  async onBoardChanged(): Promise<void> {
    await reconcile();
  },

  /**
   * chrome:// pages cannot be filtered by declarativeNetRequest, so the only
   * lever for chrome://extensions is to notice the navigation and steer away.
   */
  async onTabNavigated(tabId: number, url: string | undefined): Promise<void> {
    if (!url) return;
    const settings = await getSettings();
    const { blockDuringFocus, guardSettingsPages } = settings.focusBoard;
    if (!settings.enabled['focus-board'] || !blockDuringFocus || !guardSettingsPages) return;

    const board = await getBoard();
    if (!board.timer || isSessionOver(board.timer, Date.now())) return;
    if (!isGuardedUrl(url, chrome.runtime.getURL('src/options/index.html'))) return;

    await divertTab(tabId, 'settings');
  },
};

/**
 * Single source of truth for "what should be true right now": ends an expired
 * session, keeps the end-alarm honest, syncs the block rules, paints the badge.
 * Safe to call from anywhere, including its own storage-change listener — the
 * only write it makes is stopping an already-expired timer, which converges.
 */
export async function reconcile(): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled['focus-board']) {
    await clearNetworkRules();
    await clearBadge();
    return;
  }

  const board = await getBoard();

  // An expired session may have outlived a sleeping service worker.
  if (board.timer && isSessionOver(board.timer, Date.now())) {
    await stopTimer();
    await chrome.alarms.clear(END_ALARM);
    await clearNetworkRules();
    await setBadge('✓', DONE_COLOR);
    return;
  }

  const running = board.timer !== null;
  const { blockDuringFocus, blocklist } = settings.focusBoard;
  const sites = running && blockDuringFocus ? normaliseSites(blocklist) : [];
  await applyNetworkRules(sites);

  // Keep a one-shot alarm pinned to the exact finish time. Minute-granularity
  // ticks would let a session overrun by up to 59s before the block lifted.
  const endsAt = sessionEndsAt(board.timer);
  if (endsAt !== null) {
    const existing = await chrome.alarms.get(END_ALARM);
    if (!existing || Math.abs(existing.scheduledTime - endsAt) > 1000) {
      await chrome.alarms.create(END_ALARM, { when: endsAt });
    }
  } else {
    await chrome.alarms.clear(END_ALARM);
  }

  await refreshBadge(board, settings.focusBoard.showBadge);
}

/**
 * Badge shows the live session: minutes remaining on a fixed run, minutes
 * elapsed on an open-ended one. Cleared whenever nothing is running.
 */
async function refreshBadge(
  board: Awaited<ReturnType<typeof getBoard>>,
  showBadge: boolean,
): Promise<void> {
  if (!showBadge || !board.timer) {
    await clearBadge();
    return;
  }
  const now = Date.now();
  const remaining = sessionRemaining(board.timer, now);
  if (remaining === null) {
    await setBadge(formatBadge(runSeconds(board.timer, board.timer.taskId, now)), RUNNING_COLOR);
    return;
  }
  // Round up so a 24:30 remainder reads "25", not "24" — a countdown that hits
  // 0 while time is left reads as broken.
  await setBadge(String(Math.ceil(remaining / 60)), RUNNING_COLOR);
}

async function setBadge(text: string, color: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

async function clearBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: '' });
}
