import type { PanelContext, PopupPage } from '../../shared/panel';
import { emptyNote } from '../../shared/dom';
import { buildTodos, openFullBoard, paintSpent, restoreFocus } from './board-view';
import { paintClock, renderTimerPanel } from './timer-panel';
import { getBoard, rolloverIfNewDay } from './store';

export const focusBoardPopupPage: PopupPage = {
  id: 'focus',
  featureId: 'focus-board',
  label: 'Focus',
  icon: '◎',
  render: renderFocusBoard,
};

/** Ticks the live clock between storage-driven re-renders. */
let tickHandle: number | undefined;

/**
 * The popup is the same board as the full tab, stacked instead of side by side
 * because 380px cannot hold two columns.
 */
async function renderFocusBoard(container: HTMLElement, ctx: PanelContext): Promise<void> {
  if (tickHandle !== undefined) {
    clearInterval(tickHandle);
    tickHandle = undefined;
  }

  if (!ctx.settings.enabled['focus-board']) {
    container.replaceChildren(emptyNote('Focus Board is disabled.', 'fb-empty'));
    return;
  }

  await rolloverIfNewDay(ctx.settings.focusBoard.autoRollover);
  const board = await getBoard();

  const root = document.createElement('div');
  root.className = 'fb-surface popup';

  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'fb-expand';
  expand.textContent = '⤢ Open full board';
  expand.title = 'Open the board in a tab, where you can edit it comfortably';
  expand.addEventListener('click', openFullBoard);

  const panel = await renderTimerPanel(board, ctx.settings, ctx.refresh);
  const todos = buildTodos(board, { mode: 'popup', settings: ctx.settings, refresh: ctx.refresh });

  root.append(expand, panel, todos);
  container.replaceChildren(root);
  restoreFocus(container);

  // Only run a clock when there is something to count.
  if (board.timer) {
    const tick = (): void => {
      const now = Date.now();
      paintClock(panel, board, now);
      paintSpent(container, board, now);
    };
    tickHandle = window.setInterval(tick, 1000);
    tick();
  }
}
