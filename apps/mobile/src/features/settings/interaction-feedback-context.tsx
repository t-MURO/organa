import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import {
  createContext,
  type PropsWithChildren,
  useContext,
} from "react";

import { useSettings } from "./settings-context";

interface InteractionFeedbackContextValue {
  created(): void;
  completed(): void;
}

const InteractionFeedbackContext = createContext<
  InteractionFeedbackContextValue | undefined
>(undefined);

export function InteractionFeedbackProvider({ children }: PropsWithChildren) {
  const { settings } = useSettings();
  const createPlayer = useAudioPlayer(
    require("../../../assets/audio/create.wav"),
  );
  const completePlayer = useAudioPlayer(
    require("../../../assets/audio/complete.wav"),
  );
  createPlayer.volume = 0.2;
  completePlayer.volume = 0.22;

  function play(player: typeof createPlayer) {
    if (!settings.appSoundsEnabled) return;
    void player.seekTo(0).then(() => player.play());
  }

  function created() {
    play(createPlayer);
  }

  function completed() {
    play(completePlayer);
    if (settings.hapticsEnabled) {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    }
  }

  return (
    <InteractionFeedbackContext.Provider value={{ completed, created }}>
      {children}
    </InteractionFeedbackContext.Provider>
  );
}

export function useInteractionFeedback() {
  const context = useContext(InteractionFeedbackContext);
  if (!context) {
    throw new Error(
      "useInteractionFeedback must be used inside InteractionFeedbackProvider.",
    );
  }
  return context;
}
