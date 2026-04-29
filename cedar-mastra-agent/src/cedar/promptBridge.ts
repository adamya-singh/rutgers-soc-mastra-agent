export const CEDAR_SUBMIT_PROMPT_EVENT = 'cedar:submit-prompt';

export interface CedarSubmitPromptDetail {
  prompt: string;
}

export function dispatchCedarPrompt(prompt: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<CedarSubmitPromptDetail>(CEDAR_SUBMIT_PROMPT_EVENT, {
      detail: { prompt },
    }),
  );
}
