import { T, useGT } from "gt-react";
import { CheckIcon, DownloadIcon, Trash2Icon, XIcon } from "lucide-react";

import {
  cancelTextToSpeechModelDownload,
  downloadTextToSpeechModel,
  removeTextToSpeechModel,
  TEXT_TO_SPEECH_MODEL_SIZE,
  useTextToSpeechModel,
} from "~/speech/textToSpeechModel";
import { unloadTextToSpeech } from "~/speech/textToSpeechPlayer";
import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

export function TextToSpeechSettings() {
  const gt = useGT();
  const setting = useSearchableSetting();
  const model = useTextToSpeechModel();
  const size = `${Math.round(TEXT_TO_SPEECH_MODEL_SIZE / 1024 / 1024)} MB`;
  const percent =
    model.status === "downloading"
      ? Math.round((model.downloaded / TEXT_TO_SPEECH_MODEL_SIZE) * 100)
      : 0;

  return (
    <SettingsSection id="voice-text-to-speech" title={gt("Text to speech")}>
      <SettingsRow
        {...setting("text-to-speech-model")}
        title={gt("Kokoro voice model")}
        description={
          model.status === "downloading"
            ? gt("{percent}% downloaded", { percent })
            : model.status === "missing" && model.error
              ? gt("Download failed: {error}", { error: model.error })
              : gt(
                  "Reads assistant replies aloud on this device. Download it once ({size}); nothing you read leaves this computer.",
                  { size },
                )
        }
        control={
          model.status === "downloading" ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={gt("Cancel Kokoro download")}
              onClick={cancelTextToSpeechModelDownload}
            >
              <XIcon />
              <T>Cancel</T>
            </Button>
          ) : model.status === "installed" ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" disabled>
                <CheckIcon />
                <T>Installed</T>
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={gt("Delete Kokoro voice model")}
                onClick={() => {
                  unloadTextToSpeech();
                  void removeTextToSpeechModel();
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={model.status === "checking"}
              onClick={() => void downloadTextToSpeechModel()}
            >
              <DownloadIcon />
              <T>Download</T>
            </Button>
          )
        }
      />
    </SettingsSection>
  );
}
