import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import nodemailer from 'nodemailer';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({ limit: '50mb' }));

app.post('/api/send-email', async (req, res) => {
  const { settings, email } = req.body;
  
  if (!settings || !email) {
    return res.status(400).json({ error: 'Missing settings or email data' });
  }

  try {
    if (settings.provider === 'smtp') {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: parseInt(settings.smtpPort || '587', 10),
        secure: parseInt(settings.smtpPort) === 465,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass,
        },
      });

      const mailOptions = {
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: email.to,
        subject: email.subject,
        html: email.body,
        replyTo: settings.replyTo || undefined,
      };

      const info = await transporter.sendMail(mailOptions);
      return res.json({ success: true, messageId: info.messageId });
    } 
    else if (settings.provider === 'sendgrid') {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to }] }],
          from: { email: settings.fromEmail, name: settings.fromName },
          reply_to: settings.replyTo ? { email: settings.replyTo } : undefined,
          subject: email.subject,
          content: [{ type: 'text/html', value: email.body }],
          tracking_settings: {
            click_tracking: { enable: settings.trackClicks || false, enable_text: false },
            open_tracking: { enable: settings.trackOpens || false }
          }
        })
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`SendGrid Error: ${errData}`);
      }
      return res.json({ success: true });
    }
    else if (settings.provider === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': settings.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: settings.fromName, email: settings.fromEmail },
          to: [{ email: email.to }],
          replyTo: settings.replyTo ? { email: settings.replyTo } : undefined,
          subject: email.subject,
          htmlContent: email.body
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Unknown Brevo Error' }));
        const errorMessage = errData.message || JSON.stringify(errData);
        throw new Error(`Brevo API Error (${response.status}): ${errorMessage}`);
      }
      return res.json({ success: true });
    }
    else if (settings.provider === 'mailgun') {
      const domain = settings.fromEmail.split('@')[1];
      if (!domain) throw new Error('Invalid fromEmail for Mailgun domain extraction');
      
      const formData = new URLSearchParams();
      formData.append('from', `${settings.fromName} <${settings.fromEmail}>`);
      formData.append('to', email.to);
      formData.append('subject', email.subject);
      formData.append('html', email.body);
      if (settings.replyTo) formData.append('h:Reply-To', settings.replyTo);
      if (settings.trackOpens) formData.append('o:tracking-opens', 'yes');
      if (settings.trackClicks) formData.append('o:tracking-clicks', 'yes');

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`api:${settings.apiKey}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Mailgun Error: ${errData}`);
      }
      return res.json({ success: true });
    }
    else {
      return res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (error: unknown) {
    console.error('Email sending error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to send email';
    return res.status(500).json({ error: msg });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
