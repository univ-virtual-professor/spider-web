import LandingLayout from "@widgets/layout/LandingLayout";
import { motion } from "framer-motion";

const Privacy = () => {
  return (
    <LandingLayout>
      <section className="section-padding section-1">
        <div className="container-main">
          <motion.div
            className="mx-auto max-w-4xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="mb-4 text-4xl font-bold sm:text-5xl">Privacy Policy</h1>
            <p className="mb-12 text-muted-foreground">Last updated: 24/01/2026</p>

            <div className="prose prose-lg max-w-none">
              <p>
                At <strong>Preparekaro.in</strong>, your privacy is important to us. This Privacy
                Policy explains how we collect, use, and protect your information.
              </p>

              <h2>1. Information We Collect</h2>
              <p>We may collect:</p>
              <ul>
                <li>Name, email, phone number</li>
                <li>Coaching center or institution details</li>
                <li>Student performance data (for analytics purposes)</li>
                <li>Usage data (pages visited, features used)</li>
              </ul>

              <h2>2. How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ul>
                <li>Provide and improve our services</li>
                <li>Enable platform functionality</li>
                <li>Communicate updates, support, and demos</li>
                <li>Generate analytics for teachers and students</li>
              </ul>

              <h2>3. Data Protection</h2>
              <p>
                We take reasonable security measures to protect your data. However, no online system
                is completely secure.
              </p>

              <h2>4. Data Sharing</h2>
              <p>
                We do not sell or rent your personal data to third parties. We may share information
                only when required by law or with trusted service providers (e.g., email or hosting
                services).
              </p>

              <h2>5. Cookies</h2>
              <p>
                Preparekaro.in may use cookies to improve user experience and platform performance.
              </p>

              <h2>6. Student Data</h2>
              <p>
                Student performance data is used strictly for analytics, progress tracking, and
                improving learning outcomes. We do not use student data for advertising purposes.
              </p>

              <h2>7. User Rights</h2>
              <p>You may request to:</p>
              <ul>
                <li>Access your data</li>
                <li>Update or correct your information</li>
                <li>Delete your account (subject to applicable rules)</li>
              </ul>

              <h2>8. Policy Updates</h2>
              <p>
                We may update this Privacy Policy from time to time. Any changes will be posted on
                this page.
              </p>

              <h2>9. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, contact us at:{" "}
                <strong>info.univlive@gmail.com</strong>
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </LandingLayout>
  );
};

export default Privacy;
