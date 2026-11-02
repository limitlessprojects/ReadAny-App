export type ThinkTaggedChunk =
  | { type: "token"; content: string }
  | { type: "reasoning"; content: string };

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

function getTrailingTagPrefixLength(value: string, tag: string): number {
  const maxPrefixLength = Math.min(value.length, tag.length - 1);

  for (let length = maxPrefixLength; length > 0; length--) {
    if (value.endsWith(tag.slice(0, length))) {
      return length;
    }
  }

  return 0;
}

export class ThinkTagStreamParser {
  private mode: "text" | "reasoning" = "text";
  private carry = "";

  push(chunk: string): ThinkTaggedChunk[] {
    if (!chunk) return [];

    this.carry += chunk;
    const events: ThinkTaggedChunk[] = [];

    while (this.carry) {
      const currentTag = this.mode === "text" ? THINK_OPEN_TAG : THINK_CLOSE_TAG;
      const nextMode = this.mode === "text" ? "reasoning" : "text";
      const matchIndex = this.carry.indexOf(currentTag);

      if (matchIndex >= 0) {
        const content = this.carry.slice(0, matchIndex);
        if (content) {
          events.push({
            type: this.mode === "text" ? "token" : "reasoning",
            content,
          });
        }

        this.carry = this.carry.slice(matchIndex + currentTag.length);
        this.mode = nextMode;
        continue;
      }

      const carryLength = getTrailingTagPrefixLength(this.carry, currentTag);
      const safeContent = this.carry.slice(0, this.carry.length - carryLength);

      if (safeContent) {
        events.push({
          type: this.mode === "text" ? "token" : "reasoning",
          content: safeContent,
        });
      }

      this.carry = this.carry.slice(this.carry.length - carryLength);
      break;
    }

    return events;
  }

  flush(): ThinkTaggedChunk[] {
    if (!this.carry) {
      this.mode = "text";
      return [];
    }

    const events: ThinkTaggedChunk[] = [
      {
        type: this.mode === "text" ? "token" : "reasoning",
        content: this.carry,
      },
    ];

    this.reset();
    return events;
  }

  reset(): void {
    this.mode = "text";
    this.carry = "";
  }
}
