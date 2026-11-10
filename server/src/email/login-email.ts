import type { EmailMessage } from './send.ts';

// Linear's "Login for Linear" email, as core/email.py renders it; the markup
// is the Python one, byte for byte, so either server sends the same email.

// Python's html.escape(value, quote=True).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const LINEAR_EMAIL_FONT =
  '"Inter Display","Inter","SF Pro",-apple-system,BlinkMacSystemFont,ui-sans-serif,' +
  '"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Open Sans","Helvetica Neue",sans-serif';

// Gmail keeps the head styles but not the body rule, so there the paragraphs
// fall back to Arial 13px, exactly as Linear's do. No dark styles, as Linear.
const LOGIN_EMAIL_HEAD_CSS = `
* { box-sizing: border-box; }
body { font-family: Inter, "SF Pro", -apple-system, BlinkMacSystemFont, ui-sans-serif, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif; font-size: 15px; line-height: 1.4; color: #3c4149; background: #f9f8f9; }
table { border-spacing: 0; }
a { color: #6666ff; text-decoration: none; }
code, pre { font-family: "Berkeley Mono", "SFMono Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; }
h1, h2, h3, h4, h5, h6 { font-family: "Inter Display", Inter, "SF Pro", -apple-system, BlinkMacSystemFont, ui-sans-serif, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif; }
p { margin-top: 0; margin-bottom: 16px; }
#__bodyTable__ { margin: 0; padding: 0; width: 100% !important; }
`;

export function loginCodeEmailHtml(otpCode: string, loginLink: string | null): string {
  const font = escapeHtml(LINEAR_EMAIL_FONT);
  const code = escapeHtml(otpCode);
  let heading: string;
  let preheader: string;
  let button: string;
  let intro: string;
  if (loginLink) {
    const link = escapeHtml(loginLink);
    heading = 'Your login code for Buyerly';
    preheader =
      `To log in to Buyerly, follow this link <a href="${link}">${link}</a>.\n` +
      `If you can't click on the link, you can also copy the verification code into your browser:\n${code}`;
    button =
      `<a href="${link}" target="_blank" rel="noopener" style="margin-top:8px;margin-bottom:24px;` +
      'display:inline-block;padding:12px 16px;color:#fff;background:#5e6ad2;border-radius:5px;' +
      'font-size:13px;line-height:1.2;font-weight:500;text-decoration:none">Log in to Buyerly</a>';
    intro =
      'This link and code will only be valid for the next 5 minutes. ' +
      'If the link does not work, you can use the login verification code directly:';
  } else {
    heading = 'Your verification code for Buyerly';
    preheader = `Your Buyerly verification code:\n${code}`;
    button = '';
    intro = 'This code will only be valid for the next 5 minutes:';
  }
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading}</title>
  <style>${LOGIN_EMAIL_HEAD_CSS}</style>
</head>
<body>
  <div bgcolor="#F9F8F9" width="100%" style="width:100%!important;background:#f9f8f9;margin:0;padding:0;min-width:100%;direction:ltr">
    <table bgcolor="#F9F8F9" id="__bodyTable__" width="100%" style="width:100%!important;background:#f9f8f9;margin:0;padding:0;min-width:100%">
      <tr>
        <td align="center">
          <span style="display:none!important;color:#f9f8f9;margin:0;padding:0;font-size:1px;line-height:1px">${preheader}</span>
          <table id="main" width="602" style="width:602px;margin:24px;max-width:90vw" border="0" cellspacing="0" cellpadding="0"><tr><td align="left">
            <table width="100%" style="border:1px solid #eff1f4;border-radius:5px;padding:32px 28px 24px 28px;background:#fff;color:#3c4149" border="0" cellspacing="0" cellpadding="0"><tr><td>
              <table width="100%" style="margin-bottom:46px" border="0" cellspacing="0" cellpadding="0"><tr><td><a href="https://buyerly.app" target="_blank" rel="noopener"><img alt="Buyerly" src="https://buyerly.app/buyerly-wordmark@4x.png" height="22" width="63" style="display:block"></a></td></tr></table>
              <h1 style="font-size:24px;line-height:1.2;font-weight:700;font-family:${font};margin-top:0;margin-bottom:24px;color:#282a30">${heading}</h1>${button}<p>${intro}</p><p><code style="display:inline-block;padding:4px 6px;line-height:1em;font-size:1.2em;font-weight:bold;border-radius:4px;letter-spacing:1.4px;background:#dfe1e4">${code}</code></p>
            </td></tr></table>
            <table width="100%" style="width:100%;margin-top:32px;padding-left:28px;padding-right:28px;font-size:14px;line-height:1.5" border="0" cellspacing="0" cellpadding="0"><tr><td style="width:50%"><a href="https://buyerly.app" style="color:#3c4149;white-space:nowrap" target="_blank" rel="noopener">Buyerly</a></td></tr></table>
          </td></tr></table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

// A one-time login link and its ten-letter fallback code (with a link), or a
// bare verification code (email change).
export function otpVerificationEmail(to: string, otpCode: string, loginLink: string | null = null): EmailMessage {
  const subject = loginLink ? 'Login for Buyerly' : `Your Buyerly verification code is ${otpCode}`;
  const linkText = loginLink
    ? `To log in to Buyerly, follow this link ${loginLink}\n` +
      "If you can't click on the link, you can also copy the verification code into your browser:\n"
    : 'Your Buyerly verification code:\n';
  const text = `${linkText}${otpCode}\n\nThe link and code are valid for 5 minutes and can be used only once.`;
  return { to, subject, html: loginCodeEmailHtml(otpCode, loginLink), text };
}
