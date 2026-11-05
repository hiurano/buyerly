import { escapeHtml } from './login-email.ts';
import type { EmailMessage } from './send.ts';

// The workspace emails of core/email.py: the invitation, and Linear's
// "<name> joined your workspace" to whoever sent the invite. The markup is
// Python's, except that names are escaped here (Python puts them in raw).

const capitalize = (value: string) => value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();

export function invitationEmail(options: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  inviteToken: string;
}): EmailMessage {
  const { workspaceName, inviterName, role, inviteToken } = options;
  const subject = `${inviterName || 'A team member'} invited you to join ${workspaceName} on Buyerly`;
  const joinUrl = `https://buyerly.app/invite/${inviteToken}`;
  const workspace = escapeHtml(workspaceName);
  const url = escapeHtml(joinUrl);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>You're invited to join ${workspace} on Buyerly</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#101112;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F5F6F8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #E6E7EA;box-shadow:0 2px 8px rgba(0,0,0,0.04);overflow:hidden;padding:36px 32px;">
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#101112;">Buyerly</div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:12px;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#101112;text-align:center;">You've been invited!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;color:#5A5E66;font-size:14px;line-height:1.5;text-align:center;">
              <strong>${escapeHtml(inviterName || 'A colleague')}</strong> has invited you to collaborate in the <strong>${workspace}</strong> workspace as <strong>${escapeHtml(capitalize(role))}</strong>.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${url}" target="_blank" style="display:inline-block;background:#266DF0;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;box-shadow:0 1px 3px rgba(38,109,240,0.3);">
                Accept & Join Workspace
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;color:#898A8D;font-size:12px;line-height:1.5;text-align:center;">
              Or copy this link to your browser:<br>
              <a href="${url}" style="color:#266DF0;word-break:break-all;font-size:11px;">${url}</a>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #E6E7EA;padding-top:20px;text-align:center;color:#898A8D;font-size:11px;">
              &copy; 2026 Buyerly &middot; Automated Media Buying Platform
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `You've been invited to join ${workspaceName} on Buyerly by ${inviterName}.\n\nClick the link below to accept your invitation:\n${joinUrl}`;
  return { to: options.to, subject, html, text };
}

const LINEAR_EMAIL_FONT =
  '"Inter Display","Inter","SF Pro",-apple-system,BlinkMacSystemFont,ui-sans-serif,' +
  '"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Open Sans","Helvetica Neue",sans-serif';

// _linear_email_html: logo, heading, body, one button, then Buyerly | Unsubscribe.
function linearEmailHtml(options: { heading: string; bodyHtml: string; button: string; url: string; settingsUrl: string }): string {
  const font = escapeHtml(LINEAR_EMAIL_FONT);
  const heading = escapeHtml(options.heading);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading}</title>
</head>
<body style="background-color:#F9F8F9;margin:0;padding:0;font-family:${font};">
  <span style="display:none!important;color:#F9F8F9;margin:0;padding:0;font-size:1px;line-height:1px;">${heading}</span>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#F9F8F9;margin:0;padding:0;min-width:100%;">
    <tr>
      <td align="center">
        <table border="0" cellspacing="0" cellpadding="0" style="width:602px;margin:24px;max-width:90vw;">
          <tr>
            <td>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border:1px solid #EFF1F4;border-radius:5px;padding:32px 28px 24px 28px;background:#FFF;color:#3C4149;">
                <tr>
                  <td style="font-family:${font};">
                    <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom:48px;">
                      <tr>
                        <td><a href="https://buyerly.app" target="_blank" rel="noopener"><img alt="Buyerly" src="https://buyerly.app/buyerly-logotype@4x.png" height="22" width="92" style="display:block"></a></td>
                      </tr>
                    </table>
                    <h1 style="font-size:24px;line-height:1.2;font-weight:700;font-family:${font};margin-top:0;margin-bottom:24px;color:#282a30;">${heading}</h1>
                    ${options.bodyHtml}
                    <a href="${escapeHtml(options.url)}" target="_blank" rel="noopener" style="margin-top:8px;margin-bottom:24px;display:inline-block;padding:12px 16px;color:#171717;background:#F5B800;border-radius:5px;font-size:13px;line-height:1.2;font-weight:500;text-decoration:none;">${escapeHtml(options.button)}</a>
                  </td>
                </tr>
              </table>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:32px;padding-left:28px;padding-right:28px;font-size:14px;line-height:1.5;font-family:${font};">
                <tr>
                  <td width="50%"><span style="color:#3C4149;white-space:nowrap;">Buyerly</span></td>
                  <td width="50%" style="text-align:right;"><a href="${escapeHtml(options.settingsUrl)}" target="_blank" rel="noopener">Unsubscribe</a></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function inviteAcceptedEmail(options: { to: string; memberName: string; membersUrl: string; settingsUrl: string }): EmailMessage {
  const heading = `${options.memberName} joined your Buyerly workspace`;
  const paragraph = 'Invite more teammates to your workspace:';
  const html = linearEmailHtml({
    heading,
    bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:21px;color:#3C4149;">${escapeHtml(paragraph)}</p>`,
    button: 'Invite teammates',
    url: options.membersUrl,
    settingsUrl: options.settingsUrl,
  });
  const text = [heading, '', paragraph, options.membersUrl, '', `Unsubscribe: ${options.settingsUrl}`].join('\n');
  return { to: options.to, subject: heading, html, text };
}
