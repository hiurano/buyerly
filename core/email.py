import logging
import httpx
from html import escape
from typing import Optional
from core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """Send transactional email via Resend API or log in local dev mode."""
    if not to_email or not to_email.strip():
        logger.warning("Attempted to send email to empty recipient")
        return False

    recipient = to_email.strip()
    sender = settings.EMAIL_FROM or "Buyerly <team@buyerly.app>"

    # 1. If Resend API key is configured, send via Resend REST API
    if settings.RESEND_API_KEY:
        try:
            payload = {
                "from": sender,
                "to": [recipient],
                "subject": subject,
                "html": html_content,
            }
            if text_content:
                payload["text"] = text_content

            clean_key = settings.RESEND_API_KEY.strip("\"' \t\r\n")
            headers = {
                "Authorization": f"Bearer {clean_key}",
                "Content-Type": "application/json",
                "User-Agent": "buyerly/1.0",
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(RESEND_API_URL, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    logger.info("Email sent successfully via Resend to %s: %s", recipient, resp.text)
                    return True
                else:
                    logger.error("Failed to send email via Resend to %s: HTTP %d %s", recipient, resp.status_code, resp.text)
                    return False
        except Exception as e:
            logger.error("Exception while sending email via Resend to %s: %s", recipient, e)
            return False

    # 2. Local fallback / logging mode
    logger.info("[DEV EMAIL] To: %s | Subject: %s | (No RESEND_API_KEY configured)", recipient, subject)
    return True


async def send_otp_verification_email(
    to_email: str,
    otp_code: str,
    login_link: Optional[str] = None,
) -> bool:
    """Send a one-time login link and its six-digit manual fallback code."""
    subject = f"Your Buyerly verification code is {otp_code}"
    safe_login_link = escape(login_link or "", quote=True)
    login_link_html = ""
    if safe_login_link:
        login_link_html = f"""
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <a href="{safe_login_link}" target="_blank" rel="noopener" style="display:inline-block;background:#F5A300;color:#171717;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
                Log in to Buyerly
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:18px;color:#898A8D;font-size:12px;line-height:1.5;text-align:center;">
              Or enter this code manually:
            </td>
          </tr>"""
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Buyerly verification code</title>
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
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#101112;text-align:center;">Your verification code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;color:#5A5E66;font-size:14px;line-height:1.5;text-align:center;">
              Use the secure link below to sign in. The link and manual code are valid for 15 minutes and can be used only once.
            </td>
          </tr>
          {login_link_html}
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="display:inline-block;background:#F5F6F8;border:1px solid #E6E7EA;border-radius:8px;padding:14px 28px;font-size:32px;font-weight:700;letter-spacing:6px;color:#266DF0;font-family:monospace,sans-serif;">
                {otp_code}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;color:#898A8D;font-size:12px;line-height:1.5;text-align:center;">
              If you didn't request this verification code, you can safely ignore this email.
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
</html>"""

    link_text = f"Log in: {login_link}\n\n" if login_link else ""
    text_content = (
        f"{link_text}Your Buyerly verification code is: {otp_code}\n\n"
        "The link and code are valid for 15 minutes and can be used only once.\n"
        "If you didn't request this, please ignore this email."
    )
    return await send_email(to_email, subject, html_content, text_content)


async def send_workspace_invitation_email(
    to_email: str,
    workspace_name: str,
    inviter_name: str,
    role: str,
    invite_token: str
) -> bool:
    """Send workspace invitation email with direct join link."""
    subject = f"{inviter_name or 'A team member'} invited you to join {workspace_name} on Buyerly"
    join_url = f"https://buyerly.app/invite/{invite_token}"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>You're invited to join {workspace_name} on Buyerly</title>
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
              <strong>{inviter_name or 'A colleague'}</strong> has invited you to collaborate in the <strong>{workspace_name}</strong> workspace as <strong>{role.capitalize()}</strong>.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="{join_url}" target="_blank" style="display:inline-block;background:#266DF0;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;box-shadow:0 1px 3px rgba(38,109,240,0.3);">
                Accept & Join Workspace
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;color:#898A8D;font-size:12px;line-height:1.5;text-align:center;">
              Or copy this link to your browser:<br>
              <a href="{join_url}" style="color:#266DF0;word-break:break-all;font-size:11px;">{join_url}</a>
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
</html>"""

    text_content = f"You've been invited to join {workspace_name} on Buyerly by {inviter_name}.\n\nClick the link below to accept your invitation:\n{join_url}"
    return await send_email(to_email, subject, html_content, text_content)


# Linear's notification email, measured in a live Linear email (2026-10-02).
LINEAR_EMAIL_FONT = (
    '"Inter Display","Inter","SF Pro",-apple-system,BlinkMacSystemFont,ui-sans-serif,'
    '"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Open Sans","Helvetica Neue",sans-serif'
)


def _linear_email_html(
    *, heading: str, body_html: str, button: str, url: str, settings_url: str
) -> str:
    """Linear's email card: logo, heading, body, one button, then Buyerly | Unsubscribe."""
    font = escape(LINEAR_EMAIL_FONT, quote=True)
    safe_heading = escape(heading)
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_heading}</title>
</head>
<body style="background-color:#F9F8F9;margin:0;padding:0;font-family:{font};">
  <span style="display:none!important;color:#F9F8F9;margin:0;padding:0;font-size:1px;line-height:1px;">{safe_heading}</span>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#F9F8F9;margin:0;padding:0;min-width:100%;">
    <tr>
      <td align="center">
        <table border="0" cellspacing="0" cellpadding="0" style="width:602px;margin:24px;max-width:90vw;">
          <tr>
            <td>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border:1px solid #EFF1F4;border-radius:5px;padding:32px 28px 24px 28px;background:#FFF;color:#3C4149;">
                <tr>
                  <td style="font-family:{font};">
                    <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom:48px;">
                      <tr>
                        <td style="vertical-align:middle;padding-right:8px;"><img src="https://buyerly.app/buyerly-logo.png" width="20" height="20" alt="" style="display:block;border-radius:4px;"></td>
                        <td style="vertical-align:middle;font-size:15px;font-weight:600;color:#282a30;">Buyerly</td>
                      </tr>
                    </table>
                    <h1 style="font-size:24px;line-height:1.2;font-weight:700;font-family:{font};margin-top:0;margin-bottom:24px;color:#282a30;">{safe_heading}</h1>
                    {body_html}
                    <a href="{escape(url, quote=True)}" target="_blank" rel="noopener" style="margin-top:8px;margin-bottom:24px;display:inline-block;padding:12px 16px;color:#171717;background:#F5B800;border-radius:5px;font-size:13px;line-height:1.2;font-weight:500;text-decoration:none;">{escape(button)}</a>
                  </td>
                </tr>
              </table>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:32px;padding-left:28px;padding-right:28px;font-size:14px;line-height:1.5;font-family:{font};">
                <tr>
                  <td width="50%"><span style="color:#3C4149;white-space:nowrap;">Buyerly</span></td>
                  <td width="50%" style="text-align:right;"><a href="{escape(settings_url, quote=True)}" target="_blank" rel="noopener">Unsubscribe</a></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


async def send_inbox_notification_email(
    *,
    to_email: str,
    workspace_name: str,
    title: str,
    target: str,
    account_name: str,
    message: str,
    url: str,
    settings_url: str,
) -> bool:
    """Email one unread Inbox notification, laid out like Linear's, with a link straight to it."""
    heading = f"{title}: {target}" if target else title
    context = " · ".join(part for part in (account_name, workspace_name) if part and part != target)
    context_html = (
        f'<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#8B94A0;">{escape(context)}</p>'
        if context
        else ""
    )
    message_html = (
        '<div style="margin:0 0 16px;padding:7px 12px;font-size:14px;line-height:21px;'
        f'border-radius:4px;background-color:#F8F9FB;color:#3C4149;">{escape(message)}</div>'
        if message
        else ""
    )
    html_content = _linear_email_html(
        heading=heading,
        body_html=context_html + message_html,
        button="Open your Inbox",
        url=url,
        settings_url=settings_url,
    )
    text_lines = [heading]
    if context:
        text_lines.append(context)
    if message:
        text_lines += ["", message]
    text_lines += ["", f"Open your Inbox: {url}", "", f"Unsubscribe: {settings_url}"]
    return await send_email(to_email, heading, html_content, "\n".join(text_lines))


async def send_invite_accepted_email(
    *,
    to_email: str,
    member_name: str,
    members_url: str,
    settings_url: str,
) -> bool:
    """Linear's "<name> joined your Linear workspace" email to whoever sent the invite.

    Linear goes on about assigning and @-mentioning the new member, which Buyerly
    has no counterpart for, so only its invite-more line stays.
    """
    heading = f"{member_name} joined your Buyerly workspace"
    paragraph = "Invite more teammates to your workspace:"
    html_content = _linear_email_html(
        heading=heading,
        body_html=f'<p style="margin:0 0 16px;font-size:15px;line-height:21px;color:#3C4149;">{escape(paragraph)}</p>',
        button="Invite teammates",
        url=members_url,
        settings_url=settings_url,
    )
    text_content = "\n".join(
        [heading, "", paragraph, members_url, "", f"Unsubscribe: {settings_url}"]
    )
    return await send_email(to_email, heading, html_content, text_content)
