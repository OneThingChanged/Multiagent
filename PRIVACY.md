# MultiAgent Privacy Policy

Effective date: September 3, 2026

MultiAgent is a Windows desktop application for organizing and operating local AI-agent command-line sessions. This policy explains what information MultiAgent processes, where it is stored, and when it may be sent to services selected by the user.

## Information processed by MultiAgent

MultiAgent may process the following information to provide its features:

- project names, project directory paths, and workspace configuration;
- AI-agent session metadata, terminal input and output, conversation transcripts, generated-artifact references, and token-usage statistics;
- files or images that the user explicitly attaches or opens;
- application settings, approved Remote-access accounts, browser-tab metadata, and locally stored browser cookies or site data; and
- when optional Remote access is enabled, a GitHub username used for authentication and approval, signed session data, mobile profile identifiers, and revocable device-notification tokens.

MultiAgent does not include developer-operated advertising, behavioral analytics, or telemetry, and the developer does not sell personal information.

## Local storage and user control

MultiAgent is designed primarily as a local application. Session indexes, settings, transcripts derived from installed AI tools, attachments, browser-profile data, and usage records are stored on the user's device or in a storage directory chosen by the user. The user controls the projects and accounts connected to the application.

Users can remove individual sessions and managed records from MultiAgent. They can also remove application data by uninstalling MultiAgent and deleting its remaining data from the applicable Windows application-data directories, including `%APPDATA%\MultiAgent` and `%LOCALAPPDATA%\com.jintae.multiagent`, after first backing up anything they want to keep.

## Optional Remote access

Remote access is disabled unless configured by the user. When enabled, MultiAgent runs a server owned by the user and can expose approved sessions through the hostname and tunnel selected by that user. GitHub OAuth is used to obtain the authenticating account's GitHub username. A GitHub login alone does not grant access: the desktop owner must approve the account.

Remote clients may transmit session content, terminal input and output, attached files, browser frames, and commands between the user's devices and the computer running MultiAgent. The user is responsible for securing the configured hostname, tunnel, computer, and approved-account list.

## Third-party services

MultiAgent can launch or connect to third-party tools and services chosen by the user, including AI-agent providers, GitHub authentication, Cloudflare Tunnel, websites opened in the embedded browser, and other configured command-line tools. Prompts, files, account identifiers, and other content sent to those services are handled under their respective privacy policies and account settings. MultiAgent does not control third-party retention or model-training practices.

## Data disclosure

MultiAgent does not disclose user information to the developer. Information is disclosed only when the user directs the application to interact with a configured third-party service, enables Remote access, or when disclosure is required by law.

## Security

MultiAgent uses local access controls, approved-account checks, short-lived authentication state, signed session cookies, and revocable tokens for supported Remote features. No software or transmission method is completely secure, so users should keep MultiAgent and Windows updated, protect connected accounts, and avoid exposing the Remote server without HTTPS and appropriate access controls.

## Children's privacy

MultiAgent is a developer and productivity tool and is not directed to children under 13. The developer does not knowingly collect personal information from children.

## Changes to this policy

This policy may be updated when MultiAgent's data practices change. Material changes will be published through the public MultiAgent support site with a revised effective date.

## Contact

Questions or requests about this policy can be submitted through the project's public issue tracker:

https://github.com/OneThingChanged/MultiagentSite/issues/new/choose
