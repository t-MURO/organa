import * as Haptics from "expo-haptics";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
} from "react";
import { Platform } from "react-native";

import { deliverCompletionHaptic } from "./completion-haptic";
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
  const audioModeReady = useRef(false);
  const createPlayer = useAudioPlayer(
    require("../../../assets/audio/create.wav"),
  );
  const completePlayer = useAudioPlayer(
    require("../../../assets/audio/complete.wav"),
  );
  createPlayer.volume = 0.2;
  completePlayer.volume = 0.22;

  useEffect(() => {
    let active = true;
    void setAudioModeAsync({
      interruptionMode: "mixWithOthers",
      playsInSilentMode: false,
      shouldPlayInBackground: false,
    })
      .then(() => {
        if (active) audioModeReady.current = true;
      })
      .catch(() => {
        audioModeReady.current = false;
      });
    return () => {
      active = false;
      audioModeReady.current = false;
    };
  }, []);

  function play(player: typeof createPlayer) {
    if (!settings.appSoundsEnabled || !audioModeReady.current) return;
    void player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => undefined);
  }

  function created() {
    play(createPlayer);
  }

  function completed() {
    play(completePlayer);
    void deliverCompletionHaptic(Platform.OS, settings.hapticsEnabled, {
      androidConfirm: () =>
        Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm),
      iosSuccess: () =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    });
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
