import LegalLayout from './LegalLayout';

// Real, scope-specific privacy policy reflecting Kepler's ACTUAL data flows.
// Yellow-highlighted spans are the legal specifics TurboStart must confirm with
// counsel before this is submitted for OAuth review — they are intentionally
// not invented here.
const Todo = ({ children }) => <span className="legal__todo">{children}</span>;

const PrivacyPolicy = () => (
    <LegalLayout title="Privacy Policy" updated="July 2026">
        <p className="legal__note">
            Draft for review. The highlighted items are specifics only TurboStart&rsquo;s legal owner can
            confirm (entity details, retention periods, governing law). Complete them before submitting
            for Google, Meta, or LinkedIn app review.
        </p>

        <p>
            Kepler (&ldquo;Kepler&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an AI marketing platform operated by{' '}
            <Todo>[TurboStart legal entity name, registered address]</Todo>. This policy explains what
            data we collect, how we use it, who we share it with, and the choices you have. It covers
            the Kepler web application at <Todo>[production domain, e.g. app.kepler.co]</Todo> and the
            integrations you choose to connect.
        </p>

        <h2>Information we collect</h2>
        <h3>Account &amp; workspace data</h3>
        <ul>
            <li>Account details you provide: name, email address, and authentication credentials (passwords are handled by our authentication provider and never stored by us in plain text).</li>
            <li>Workspace and brand data you create or upload: brand profile, tone and messaging, uploaded documents, competitors, ideal-customer profiles, campaigns, generated content, and the ratings/feedback you give on generated outputs.</li>
        </ul>
        <h3>Connected-service data</h3>
        <p>
            When you connect a third-party account, we store the access credentials needed to act on
            your behalf (OAuth refresh tokens or API keys) in encrypted, server-side-only storage that
            is never exposed to the browser. Depending on which services you connect, we access:
        </p>
        <ul>
            <li><strong>Google</strong> — Search Console and Analytics (read-only metrics) and, if you enable outreach sending, permission to send email on your behalf via Gmail (<code>gmail.send</code>). We do not read, modify, or store your mailbox contents.</li>
            <li><strong>Meta</strong> — the Facebook Pages and Instagram Business accounts you authorize, to publish content you approve.</li>
            <li><strong>LinkedIn</strong> — permission to publish posts you approve to your profile or authorized company pages.</li>
            <li><strong>CRM &amp; prospecting</strong> — data you sync from services such as Zoho, HubSpot, or Apollo, where connected.</li>
        </ul>
        <h3>Usage data</h3>
        <p>We collect basic technical and usage information (log data, device/browser type, feature usage) to operate and secure the service.</p>

        <h2>How we use your information</h2>
        <ul>
            <li>To provide the service: generating marketing content, running campaigns, and measuring outcomes.</li>
            <li>To act on connected accounts strictly as you direct — publishing content you approve, sending sequences you initiate, and reading the metrics you ask us to report.</li>
            <li>To improve the quality of generated output using the feedback you provide within your own workspace.</li>
            <li>To secure the service, prevent abuse, and meet legal obligations.</li>
        </ul>
        <p>We do <strong>not</strong> sell your personal information, and we do not use your connected-service data for advertising.</p>

        <h2>AI processing</h2>
        <p>
            To generate content, Kepler sends the relevant workspace context you provide (such as your
            brand details and prompts) to our AI processing provider, <strong>Google Vertex AI</strong>,
            which returns generated text. Where you enable AI-visibility measurement, category prompts
            about your brand may also be sent to third-party AI search providers to measure whether your
            brand is referenced. We do not use your data to train third-party foundation models, and our
            providers act as processors under contract. <Todo>[Confirm the final list of AI subprocessors
            with legal.]</Todo>
        </p>

        <h2>How we share information</h2>
        <p>We share data only with:</p>
        <ul>
            <li><strong>Service providers (subprocessors)</strong> who host and power Kepler — including <Todo>[confirm list: Supabase (database, auth, storage), Google Cloud / Vertex AI, Vercel (hosting)]</Todo> — under data-processing agreements.</li>
            <li><strong>Services you connect</strong>, to perform the actions you request on those services.</li>
            <li><strong>Legal and safety</strong> recipients where required by law or to protect rights and safety.</li>
        </ul>

        <h2>Google user data &mdash; Limited Use</h2>
        <p>
            Kepler&rsquo;s use and transfer of information received from Google APIs to any other app will
            adhere to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
            including the Limited Use requirements. We use Google user data solely to provide and improve
            the features you request, do not transfer it except as necessary to provide those features
            (or for security, legal, or with your consent), do not use it for advertising, and do not
            allow humans to read it except with your consent, for security, or as required by law.
        </p>

        <h2>Data retention</h2>
        <p>
            We keep your data for as long as your account is active and as needed to provide the service.
            When you disconnect an integration we delete the associated credentials; when you delete
            content or your account we remove the associated data within <Todo>[retention window, e.g. 30
            days]</Todo>, except where we must retain it to comply with law.
        </p>

        <h2>Security</h2>
        <p>
            Connected-account credentials are stored server-side only and are inaccessible to the browser.
            Access to workspace data is restricted to members of that workspace through row-level security.
            We use encryption in transit and at rest through our infrastructure providers.
        </p>

        <h2>Your rights &amp; choices</h2>
        <ul>
            <li>Disconnect any integration at any time in the app to revoke our access and delete its stored credentials.</li>
            <li>Access, correct, export, or delete your data — see <a href="/data-deletion">Data deletion</a> or contact us.</li>
            <li>Depending on your location, you may have rights under the GDPR, UK GDPR, or CCPA/CPRA. <Todo>[Confirm which regimes apply and add the required region-specific disclosures.]</Todo></li>
        </ul>

        <h2>Children</h2>
        <p>Kepler is a business tool not intended for anyone under 18, and we do not knowingly collect data from children.</p>

        <h2>Changes</h2>
        <p>We will update this policy as the product evolves and revise the date above. Material changes will be communicated in-app or by email.</p>

        <h2>Contact</h2>
        <p>
            Questions or requests: <a href="mailto:privacy@turbostart.co">privacy@turbostart.co</a>, or{' '}
            <Todo>[postal address of the data controller]</Todo>.
        </p>
    </LegalLayout>
);

export default PrivacyPolicy;
