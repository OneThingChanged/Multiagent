import appConfig from "../../app.json";

export const APP_VERSION = appConfig.expo.version;
export const MOBILE_USER_AGENT = `MultiAgentMobile/${APP_VERSION}`;
