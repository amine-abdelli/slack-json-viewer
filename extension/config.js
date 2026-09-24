/**
 * Where Slack lives. Only the test setup changes these (to point at a local
 * stub); the real extension always talks to slack.com.
 */
export const CONFIG = {
  /** Base of the Web API. The `d` session cookie is sent with each request. */
  apiBase: "https://slack.com/api",
  /** Tabs where the Slack web client keeps its signed-in workspaces. */
  appTabs: ["https://app.slack.com/*"],
  /** Opened in the background when no Slack tab is open. */
  appStart: "https://app.slack.com/client",
  /**
   * Tests only: fetch `https://files.slack.com/…` from this origin instead.
   * Always null in the real extension.
   */
  filesOrigin: null,
  /** Where the popup's "Open Loquarium" button goes. */
  loquariumUrl: "https://loquarium.vercel.app/#/import",
};
