import { speakableMarkdownText } from "@t3tools/shared/markdownSpeech";
import { useNavigate } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { SquareIcon, Volume2Icon } from "lucide-react";

import { useTextToSpeechModelInstalled } from "~/speech/textToSpeechModel";
import { speakText, stopSpeaking, useTextToSpeechPlayback } from "~/speech/textToSpeechPlayer";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ReadAloudButton({ messageKey, text }: { messageKey: string; text: string }) {
  const gt = useGT();
  const navigate = useNavigate();
  const installed = useTextToSpeechModelInstalled();
  const playback = useTextToSpeechPlayback(messageKey);
  const active = playback !== "idle";
  const label = active ? gt("Stop reading") : gt("Read aloud");

  const onClick = () => {
    if (active) return stopSpeaking();
    if (!installed) {
      void navigate({ to: "/settings/voice", hash: "text-to-speech-model" });
      return;
    }
    const speech = speakableMarkdownText(text);
    if (speech) speakText(messageKey, speech);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={onClick}
            type="button"
            size="xs"
            variant="ghost-muted"
          />
        }
      >
        {playback === "loading" ? (
          <Spinner className="size-3" />
        ) : active ? (
          <SquareIcon className="size-3" />
        ) : (
          <Volume2Icon className="size-3" />
        )}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <p>{label}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
