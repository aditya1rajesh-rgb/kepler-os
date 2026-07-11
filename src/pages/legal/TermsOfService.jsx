import LegalLayout from './LegalLayout';

const Todo = ({ children }) => <span className="legal__todo">{children}</span>;

const TermsOfService = () => (
    <LegalLayout title="Terms of Service" updated="July 2026">
        <p className="legal__note">
            Draft for review. Highlighted items (fees, governing law, entity) require TurboStart legal
            sign-off before publishing.
        </p>

        <p>
            These Terms govern your use of Kepler, operated by <Todo>[TurboStart legal entity]</Todo>. By
            creating an account or using the service, you agree to these Terms.
        </p>

        <h2>The service</h2>
        <p>
            Kepler is an AI marketing platform that helps you plan campaigns, generate content, connect
            third-party marketing services, and measure results. Features may change as the product evolves.
        </p>

        <h2>Your account</h2>
        <ul>
            <li>You must provide accurate information and keep your credentials secure.</li>
            <li>You are responsible for activity in your workspace and for the accounts you connect.</li>
            <li>You must have the authority to connect and act on any third-party account you link.</li>
        </ul>

        <h2>Acceptable use</h2>
        <p>You agree not to use Kepler to: send spam or violate anti-spam laws; publish unlawful, infringing, or deceptive content; violate the terms of any connected platform (Google, Meta, LinkedIn, or others); or attempt to disrupt or reverse-engineer the service.</p>

        <h2>Connected services</h2>
        <p>
            When you connect a third-party service, your use of that service remains subject to its own
            terms and policies. Kepler acts only as you direct — for example, publishing content you
            approve or sending sequences you initiate. You are responsible for the content you choose to
            publish or send.
        </p>

        <h2>Your content and AI output</h2>
        <ul>
            <li>You retain ownership of the content and data you provide. You grant us the rights needed to operate the service on your behalf.</li>
            <li>AI-generated output may be inaccurate or unsuitable; you are responsible for reviewing and approving anything before it is published or sent. Kepler&rsquo;s approval-based workflow exists for this reason.</li>
        </ul>

        <h2>Fees</h2>
        <p><Todo>[Pricing, billing terms, refund policy — to be defined.]</Todo></p>

        <h2>Termination</h2>
        <p>You may stop using Kepler and delete your account at any time. We may suspend or terminate access for breach of these Terms or misuse of the service. On termination we handle your data as described in the <a href="/privacy">Privacy Policy</a>.</p>

        <h2>Disclaimers &amp; liability</h2>
        <p>
            The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
            permitted by law, Kepler and TurboStart are not liable for indirect or consequential damages,
            and total liability is limited as set out here: <Todo>[liability cap and any consumer-law
            carve-outs, per legal]</Todo>.
        </p>

        <h2>Governing law</h2>
        <p><Todo>[Governing law and jurisdiction — per TurboStart&rsquo;s registered entity.]</Todo></p>

        <h2>Changes</h2>
        <p>We may update these Terms and will revise the date above; continued use after changes means you accept them.</p>

        <h2>Contact</h2>
        <p><a href="mailto:legal@turbostart.co">legal@turbostart.co</a></p>
    </LegalLayout>
);

export default TermsOfService;
