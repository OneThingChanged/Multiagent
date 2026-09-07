import appConfig from "../../app.json";

export const APP_VERSION = appConfig.expo.version;
export const MOBILE_USER_AGENT = `AcediaMobile/${APP_VERSION}`;
