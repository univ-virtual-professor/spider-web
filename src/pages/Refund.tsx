import LandingLayout from "@widgets/layout/LandingLayout";
import { motion } from "framer-motion";

const Refund = () => {
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
            <h1 className="mb-4 text-4xl font-bold sm:text-5xl">Refunds & Cancellations</h1>
            <p className="mb-12 text-muted-foreground">Last updated: 27/05/2026</p>

            <div className="prose prose-lg max-w-none">
              <p>
                This policy describes the refund and cancellation terms for payments made on{" "}
                <strong>Preparekaro.in</strong>. Please read it carefully before making a purchase.
              </p>

              <h2>1. Scope</h2>
              <p>
                This policy applies to all seat purchases made by coaching institutes and educators
                through the Preparekaro.in platform. All prices are listed and charged in Indian
                Rupees (INR).
              </p>

              <h2>2. General Refund Policy</h2>
              <p>
                All seat purchases on Preparekaro.in are <strong>non-refundable</strong> once
                payment is successfully processed, except in the specific circumstances listed in
                Section 3 below.
              </p>
              <p>
                We encourage educators to use our free trial period to evaluate the platform before
                committing to a paid purchase.
              </p>

              <h2>3. Eligible Refund Cases</h2>
              <p>A refund may be considered in the following situations:</p>
              <ul>
                <li>
                  <strong>Duplicate payment:</strong> If the same order was charged more than once
                  due to a technical error.
                </li>
                <li>
                  <strong>Payment debited but seats not credited:</strong> If your account was
                  debited and seats were not added to your pool within 24 hours despite a confirmed
                  payment.
                </li>
                <li>
                  <strong>Service unavailability:</strong> If Preparekaro.in is unable to provide
                  the purchased service due to reasons solely attributable to us.
                </li>
              </ul>
              <p>
                Refund requests must be raised within <strong>7 days</strong> of the transaction
                date. Requests raised after this window will not be considered.
              </p>

              <h2>4. Non-Refundable Cases</h2>
              <p>Refunds will not be provided for:</p>
              <ul>
                <li>Change of mind after purchase</li>
                <li>Seats that have already been allocated to students</li>
                <li>Partial usage of a purchased seat pool</li>
                <li>Expiry of trial-period seats</li>
                <li>Failure to use the platform within the validity period</li>
              </ul>

              <h2>5. Cancellations</h2>
              <p>
                Preparekaro.in does not offer subscription-based billing; all purchases are one-time
                seat pool additions. There is no recurring charge to cancel. If you wish to stop
                using the platform, simply do not make further purchases — your existing seats
                remain available until allocated or until validity expires.
              </p>
              <p>
                If you wish to cancel a seat purchase <em>before</em> it is processed (e.g., a
                payment link issued by our team that has not yet been paid), contact us immediately
                at <strong>info.univlive@gmail.com</strong> and we will void the link.
              </p>

              <h2>6. How to Request a Refund</h2>
              <p>
                To raise a refund request, email us at <strong>info.univlive@gmail.com</strong> with
                the subject line <em>"Refund Request – [Order ID]"</em> and include:
              </p>
              <ul>
                <li>Your registered email address</li>
                <li>The Cashfree Order ID (visible in your Billing page)</li>
                <li>Reason for the request with supporting details</li>
              </ul>
              <p>
                Our team will review your request and respond within{" "}
                <strong>5 business days</strong>. Approved refunds will be credited to the original
                payment method within 7–10 business days.
              </p>

              <h2>7. Contact Us</h2>
              <p>For any questions about this policy, reach us at:</p>
              <ul>
                <li>
                  Email: <strong>info.univlive@gmail.com</strong>
                </li>
                <li>
                  Phone: <strong>+91 96253 94589</strong>
                </li>
                <li>Support hours: 10:00 AM – 10:00 PM (Mon–Sat)</li>
              </ul>
            </div>
          </motion.div>
        </div>
      </section>
    </LandingLayout>
  );
};

export default Refund;
