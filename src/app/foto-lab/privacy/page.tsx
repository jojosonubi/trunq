export const metadata = {
  title: 'Privacy Policy: Foto Lab',
  description: 'How Foto Lab handles your data, including selfies and biometric information.',
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[15px] leading-relaxed text-neutral-900">
      <h1 className="mb-2 text-3xl font-bold">Privacy Policy: Foto Lab</h1>
      <p className="mb-10 text-sm text-neutral-600">
        Effective from 3 June 2026. Last updated 3 June 2026.
      </p>

      <p className="mb-6">
        This Privacy Policy explains how Recess, a Highrollerco Ltd brand
        (&ldquo;<strong>Recess</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;), handles
        personal data in the Foto Lab service available at recess.land/foto-lab
        (the &ldquo;<strong>Service</strong>&rdquo;).
      </p>

      <p className="mb-10">
        Highrollerco Ltd is registered in England and Wales (company number 11259392)
        with its registered office at 20-22 Elsley Court, Great Titchfield Street,
        London W1W 8BE. We are the data controller for personal data processed
        through the Service.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">1. Summary</h2>
      <p className="mb-3">In plain terms:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>Foto Lab lets you find photos of yourself in the Recess photo archive by uploading a selfie.</li>
        <li>Your selfie is processed in memory and sent directly to AWS Rekognition for face matching. It is never written to disk, S3, or any database. It is discarded as soon as the match completes.</li>
        <li>We do not create an account for you and we do not collect your email, name, or contact details.</li>
        <li>People photographed at Recess events have their face vectors stored in our matching system. You can request removal at any time (see Section 9).</li>
        <li>You must be 18 or over to use Foto Lab.</li>
      </ul>

      <h2 className="mb-3 mt-10 text-xl font-bold">2. Who this policy applies to</h2>
      <p className="mb-6">
        This policy applies to two groups of people:
      </p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>
          <strong>Users</strong> of the Foto Lab service, meaning anyone who uploads a selfie to
          search the archive.
        </li>
        <li>
          <strong>Attendees</strong> of Recess events whose photos appear in the
          archive. Even if you have never used Foto Lab, your face may have
          been indexed for the matching service to work.
        </li>
      </ul>

      <h2 className="mb-3 mt-10 text-xl font-bold">3. What data we process</h2>

      <h3 className="mb-2 mt-6 text-lg font-bold">3.1 If you use Foto Lab to search</h3>
      <p className="mb-3">When you upload a selfie, the following happens:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>
          The selfie image is sent from your browser to our server as encoded bytes.
        </li>
        <li>
          Our server decodes the bytes in memory and passes them directly to AWS
          Rekognition&rsquo;s SearchFacesByImage API. Rekognition generates a temporary
          face embedding to perform the search and does not retain it after the
          API call returns.
        </li>
        <li>
          The selfie image itself is <strong>not written to any disk, S3 bucket,
          database, or other persistent storage</strong>. It exists only in the server
          process memory for the duration of the request and is discarded
          immediately after.
        </li>
        <li>
          We log anonymised analytics about the search: the number of matches, the
          top similarity score, the threshold used, how long the search took, and
          a daily-rotating hashed version of your IP address. This log does not
          contain your image, your face data, or any identifier that could be
          traced back to you across days.
        </li>
      </ul>

      <h3 className="mb-2 mt-6 text-lg font-bold">3.2 If you appear in a Recess event photo</h3>
      <p className="mb-6">
        For Foto Lab to be able to match a selfie against the archive, we run
        AWS Rekognition&rsquo;s IndexFaces process on every photo in the archive.
        This generates a face vector (a mathematical representation of a face)
        for each detected face in each photo, and stores those vectors in a
        Rekognition collection. The original photo itself is stored in our
        media storage (Supabase) and presented in the public archive. We do not
        attach names to faces. The vectors are anonymous representations.
      </p>

      <h3 className="mb-2 mt-6 text-lg font-bold">3.3 Standard web data</h3>
      <p className="mb-6">
        When you visit Foto Lab, our hosting provider (Vercel) automatically
        receives standard web request data including your IP address, browser
        type, the page you requested, and the time of the request. This is
        used for service operation and security; we do not use it for advertising
        or profiling.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">4. Why we process this data</h2>
      <p className="mb-3">We process the data described above for the following purposes:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>To provide the Foto Lab matching service.</li>
        <li>To operate, maintain, and improve the Service.</li>
        <li>To investigate and prevent abuse, fraud, and security incidents.</li>
        <li>To comply with our legal obligations.</li>
      </ul>

      <h2 className="mb-3 mt-10 text-xl font-bold">5. Legal basis for processing (UK & EU GDPR)</h2>
      <p className="mb-3">Our legal bases under the UK GDPR and the EU GDPR are:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>
          <strong>Your explicit consent (Article 9(2)(a))</strong> for the processing
          of biometric data when you upload a selfie. You give this consent by
          submitting your selfie after being informed by this policy.
        </li>
        <li>
          <strong>Legitimate interests (Article 6(1)(f))</strong> for indexing faces
          in the archive to enable the matching service, for operating the
          service, and for security and fraud prevention. We balance this
          interest against your rights and freedoms, and you can object to this
          processing at any time (see Section 9).
        </li>
      </ul>

      <h2 className="mb-3 mt-10 text-xl font-bold">6. Who we share data with</h2>
      <p className="mb-3">We share data with a small number of service providers:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>
          <strong>AWS (Amazon Web Services):</strong> for face matching via Rekognition.
          The Rekognition collection containing face vectors from event photos is
          stored in the AWS eu-west-2 (London) region.
        </li>
        <li>
          <strong>Supabase:</strong> our database and media storage provider, which
          hosts the photo archive and search analytics.
        </li>
        <li>
          <strong>Vercel:</strong> our web hosting and serverless function provider,
          which handles incoming web requests.
        </li>
        <li>
          <strong>Anthropic:</strong> used in the background to generate descriptive
          tags for archive photos (such as &ldquo;dancer&rdquo;, &ldquo;crowd&rdquo;).
          Anthropic does not receive selfies or any data from Foto Lab users.
        </li>
      </ul>
      <p className="mb-6">
        Each of these providers acts as a data processor on our behalf and is
        bound by data protection terms. We do not sell personal data, and we do
        not share it with advertisers.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">7. International transfers</h2>
      <p className="mb-6">
        Some of our service providers are based outside the UK and EU
        (notably Anthropic, in the United States). Where data is transferred
        outside the UK and EU, we rely on appropriate safeguards including the
        UK International Data Transfer Agreement, the EU Standard Contractual
        Clauses, or equivalent mechanisms.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">8. How long we keep data</h2>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>
          <strong>Your selfie</strong>: not retained. Discarded immediately after the
          match completes.
        </li>
        <li>
          <strong>Face vector generated from your selfie</strong>: not retained
          by AWS Rekognition after the search API call returns.
        </li>
        <li>
          <strong>Anonymised search analytics</strong>: retained for up to 12 months
          for service operation, then deleted.
        </li>
        <li>
          <strong>Face vectors from event photos (in the Rekognition collection)</strong>:
          retained for as long as the archive is operated, or until the data subject
          requests removal.
        </li>
        <li>
          <strong>Event photos themselves</strong>: retained indefinitely as part of
          the Recess archive, subject to removal requests.
        </li>
      </ul>

      <h2 className="mb-3 mt-10 text-xl font-bold">9. Your rights</h2>
      <p className="mb-3">Under UK and EU GDPR you have the right to:</p>
      <ul className="mb-6 list-disc space-y-2 pl-6">
        <li>Access the personal data we hold about you.</li>
        <li>Have inaccurate data corrected.</li>
        <li>Have your data erased (the &ldquo;right to be forgotten&rdquo;), including face vectors from event photos.</li>
        <li>Restrict or object to the processing of your data.</li>
        <li>Withdraw consent at any time, where we are processing on the basis of consent.</li>
        <li>Receive a copy of your data in a portable format.</li>
        <li>Lodge a complaint with a supervisory authority. In the UK, this is the Information Commissioner&rsquo;s Office (<a href="https://ico.org.uk" className="underline">ico.org.uk</a>).</li>
      </ul>
      <p className="mb-6">
        To exercise any of these rights, email <a href="mailto:help@highroller.co" className="underline">help@highroller.co</a> with
        a description of your request. If you are asking to be removed from the archive, please
        include the name of the event you attended (e.g. Recessland 2026), the approximate
        date, and a recent photo of yourself so we can identify your face data. We aim to
        respond to all requests within 30 days as required by the UK GDPR.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">10. Children</h2>
      <p className="mb-6">
        Foto Lab is not intended for use by anyone under 18. We do not knowingly
        process the personal data of anyone under 18 through Foto Lab. If you
        believe a child has used Foto Lab, please contact us and we will delete
        the relevant data.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">11. Security</h2>
      <p className="mb-6">
        We use industry-standard technical and organisational measures to protect
        personal data, including transport encryption (HTTPS/TLS), encryption at
        rest with our service providers, hashed IP addresses in analytics, and
        access controls on administrative functions. No system is perfectly
        secure, but we take reasonable steps to reduce risk.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">12. Changes to this policy</h2>
      <p className="mb-6">
        We may update this policy from time to time. When we do, we will update
        the &ldquo;Last updated&rdquo; date at the top. Material changes will be
        flagged prominently on Foto Lab.
      </p>

      <h2 className="mb-3 mt-10 text-xl font-bold">13. Contact</h2>
      <p className="mb-6">
        For any privacy questions, data requests, or complaints, email{' '}
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
