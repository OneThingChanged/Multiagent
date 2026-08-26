import type { ChatBlock } from "../platform/ipcContract";

// The backend intentionally returns only a bounded tail of large transcripts.
// Keep the already-seen prefix in renderer memory and stitch the overlapping
// tail onto it so a live conversation does not appear to lose old turns.
export function mergeChatHistory(previous: ChatBlock[], incoming: ChatBlock[]): ChatBlock[] {
  if (incoming.length === 0) return previous;
  if (previous.length === 0) return incoming.slice();

  const previousOffset = Math.max(0, previous.length - incoming.length);
  const previousKeys = previous.slice(previousOffset).map(chatBlockKey);
  const incomingKeys = incoming.map(chatBlockKey);
  const maxOverlap = Math.min(previousKeys.length, incomingKeys.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const previousStart = previousKeys.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (previousKeys[previousStart + index] !== incomingKeys[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return previous.concat(incoming.slice(overlap));
  }

  // More than one backend window may have arrived between polls. Preserve the
  // known prefix and append the newest tail even when no overlap is available.
  return previous.concat(incoming);
}

function chatBlockKey(block: ChatBlock): string {
  return JSON.stringify(block);
}
