export interface TypedMessage<K extends string = string, P = unknown> {
  kind: K;
  payload: P;
}

export async function sendMessage<Req extends TypedMessage, Res>(message: Req): Promise<Res> {
  return chrome.runtime.sendMessage(message) as Promise<Res>;
}

export type MessageHandler<Req extends TypedMessage, Res> = (
  message: Req,
  sender: chrome.runtime.MessageSender,
) => Promise<Res>;

export function registerMessageHandler<Req extends TypedMessage, Res>(
  kind: Req['kind'],
  handler: MessageHandler<Req, Res>,
): () => void {
  const listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: Res | { error: string }) => void,
  ): boolean => {
    if (!isTypedMessage(message) || message.kind !== kind) return false;
    handler(message as Req, sender).then(sendResponse, (err: unknown) => {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    });
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

function isTypedMessage(value: unknown): value is TypedMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string'
  );
}
