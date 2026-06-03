export const metadata = {
  title: 'Terms of Service: Foto Lab',
  description: 'The terms that apply when you use the Foto Lab service.',
}

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[15px] leading-relaxed text-neutral-900">
      <h1 className="mb-2 text-3xl font-bold">Terms of Service: Foto Lab</h1>
      <p className="mb-10 text-sm text-neutral-600">
        Effective from 3 June 2026. Last updated 3 June 2026.
      </p>

      <p className="mb-6">
        These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your use of
        Foto Lab, a service operated by Recess, a Highrollerco Ltd brand
        (&ldquo;<strong>Recess</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;).
        Foto Lab is available at recess.land/foto-lab.
      </p>

      <p className="mb-10">
        Highrollerco Ltd is registered in England and Wales (company number 11259392)
        with its registered office at 20-22 Elsley Court, Great Titchfield Street,
        London W1W 8BE.
      </p>

      <p className="mb-10">
        By using Foto Lab you agree to these Terms. If you do not agree, please
        do not use the service.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">1. What Foto Lab is</h2>
      <p className="mb-6">
        Foto Lab is a tool that lets you find photos of yourself in the Recess
        photo archive. You upload a selfie, our face-matching system (powered by
        AWS Rekognition) compares it against the archive, and Foto Lab returns
        photos that appear to contain you. You can also browse the full archive
        without uploading a selfie.
      </p>
      <p className="mb-6">
        Foto Lab is offered free of charge. We do not currently sell anything
        through Foto Lab.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">2. Eligibility</h2>
      <p className="mb-6">
        You must be at least 18 years old to use Foto Lab. By using the service
        you confirm that you are 18 or over.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">3. Your selfie and your consent</h2>
      <p className="mb-6">
        When you upload a selfie, you are giving us your explicit consent to
        process biometric data (a temporary face embedding generated from your
        image) for the purpose of running a single face-match search. The selfie
        is processed in memory, sent to AWS Rekognition, and discarded
        immediately after the search completes. See our{' '}
        <a href="/foto-lab/privacy" className="underline">Privacy Policy</a> for the
        full data lifecycle.
      </p>
      <p className="mb-6">
        You may withdraw consent for any future searches by simply not uploading
        further selfies.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">4. Acceptable use</h2>
      <p className="mb-3">When using Foto Lab, you agree not to:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>Upload an image that is not a selfie of yourself, or upload an image of another person without their consent.</li>
        <li>Use Foto Lab to identify, track, harass, stalk, or otherwise harm another person.</li>
        <li>Attempt to circumvent the technical or legal protections of the service, including by scraping, mass downloading, or reverse-engineering.</li>
        <li>Use Foto Lab in a way that violates any applicable law or third-party rights.</li>
        <li>Submit content that is unlawful, infringing, defamatory, or otherwise harmful.</li>
      </ul>
      <p className="mb-6">
        We may suspend or restrict access to Foto Lab if we reasonably believe
        these terms have been breached.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">5. Photos in the archive</h2>
      <p className="mb-6">
        Photos in the Recess archive were taken at Recess events. Copyright in
        each photo belongs to the photographer, and Recess holds the right to
        publish those photos through the archive. By making the archive available
        through Foto Lab, we grant you a personal, non-exclusive, non-transferable,
        revocable licence to view photos in the archive and download photos of
        yourself for personal, non-commercial use.
      </p>
      <p className="mb-6">
        You may not use photos from the archive for commercial purposes (including
        advertising, merchandise, or paid promotion) without our prior written
        permission. You may not remove credits or watermarks, or claim authorship
        of photos that are not yours.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">6. Removal requests</h2>
      <p className="mb-6">
        If you appear in a photo in the archive and want it removed, or want
        your face data removed from our matching system, email{' '}
        <a href="mailto:help@highroller.co" className="underline">help@highroller.co</a>. Please
        include the name of the event you attended (for example, Recessland 2026),
        the approximate date, and a recent photo of yourself so we can identify
        your face data. We aim to respond within 30 days. This right is in addition
        to your statutory rights under data protection law.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">7. Service availability</h2>
      <p className="mb-6">
        Foto Lab is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
        basis. We do not guarantee that the service will be uninterrupted, error-free,
        or that face matches will be accurate or complete. Face matching is a
        probabilistic process and may return false positives or miss valid
        matches. We may change, suspend, or discontinue any part of Foto Lab at
        any time, with or without notice.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">8. Limitation of liability</h2>
      <p className="mb-6">
        Nothing in these Terms limits our liability for death or personal injury
        caused by our negligence, for fraud or fraudulent misrepresentation, or
        for any other liability that cannot be limited or excluded under English
        law.
      </p>
      <p className="mb-6">
        Subject to the above, we are not liable for indirect or consequential
        loss, loss of profits, loss of business, loss of goodwill, or any loss
        arising from your use of (or inability to use) Foto Lab. Our total
        liability arising out of or in connection with Foto Lab will not exceed
        one hundred pounds (£100).
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">9. Changes to these Terms</h2>
      <p className="mb-6">
        We may update these Terms from time to time. When we do, we will update
        the &ldquo;Last updated&rdquo; date above. Material changes will be flagged
        prominently on Foto Lab. Your continued use of Foto Lab after a change
        means you accept the updated Terms.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">10. Governing law</h2>
      <p className="mb-6">
        These Terms are governed by the laws of England and Wales. Any dispute
        arising in connection with them is subject to the exclusive jurisdiction
        of the courts of England and Wales.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">11. Contact</h2>
      <p className="mb-6">
        Questions about these Terms? Email{' '}
        <a href="mailto:help@highroller.co" className="underline">help@highroller.co</a>.
      </p>

      <hr className="my-12 border-neutral-300" />

      <p className="text-xs text-neutral-500">
        Recess is a brand of Highrollerco Ltd, registered in England and Wales
        (company number 11259392), 20-22 Elsley Court, Great Titchfield Street,
        London W1W 8BE.
      </p>
    </main>
  )
}
