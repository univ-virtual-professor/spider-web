import LandingLayout from "@widgets/layout/LandingLayout";
import SEO from "@shared/components/SEO";
import { motion } from "framer-motion";
import { Mail, Phone, Clock } from "lucide-react";
import { ButtonWithIcon } from "@shared/ui/button";
import { useState } from "react";
import { useToast } from "@shared/hooks/use-toast";

const Contact = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    coachingCenter: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Message sent!",
      description: "We'll get back to you within 24 hours.",
    });
    setFormData({ name: "", email: "", phone: "", coachingCenter: "", message: "" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <LandingLayout>
      <SEO
        title="Contact Us — PrepareKaro AI Test Series Platform"
        description="Get in touch with PrepareKaro. Book a demo, ask about pricing, or get support for setting up your coaching institute's AI-powered test series platform."
        canonical="https://preparekaro.in/contact"
      />
      <section className="section-padding section-1">
        <div className="container-main">
          <motion.div
            className="mx-auto mb-16 max-w-3xl text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="mb-6 text-4xl font-bold sm:text-5xl lg:text-6xl">
              Contact{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Us
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Have questions or need support? We're here to help.
            </p>
          </motion.div>

          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-20">
            {/* Left - Info */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="mb-1 font-semibold">Phone</div>
                    <a
                      href="tel:+919625394589"
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      +91 96253 94589
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="mb-1 font-semibold">Email</div>
                    <a
                      href="mailto:info.univlive@gmail.com"
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      info.univlive@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="mb-1 font-semibold">Support Available</div>
                    <p className="text-muted-foreground">10:00 AM – 10:00 PM</p>
                  </div>
                </div>
              </div>

              {/* CTA Card */}
              <motion.div
                className="mt-12 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <h3 className="mb-2 text-lg font-bold">Book a Demo</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  See how PrepareKaro can transform your coaching center's CUET preparation.
                </p>
                <a
                  href="https://calendly.com/info-univlive"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ButtonWithIcon variant="hero" size="default">
                    Schedule Demo
                  </ButtonWithIcon>
                </a>
              </motion.div>
            </motion.div>

            {/* Right - Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <form
                onSubmit={handleSubmit}
                className="rounded-3xl border border-border bg-card p-8 shadow-card lg:p-10"
              >
                <div className="space-y-6">
                  <div>
                    <label htmlFor="name" className="mb-2 block text-sm font-medium">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="your@email.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="mb-2 block text-sm font-medium">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="+91 XXXXX XXXXX"
                    />
                  </div>

                  <div>
                    <label htmlFor="coachingCenter" className="mb-2 block text-sm font-medium">
                      Coaching Center Name
                    </label>
                    <input
                      type="text"
                      id="coachingCenter"
                      name="coachingCenter"
                      value={formData.coachingCenter}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Your coaching center"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="mb-2 block text-sm font-medium">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={4}
                      className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="How can we help you?"
                    />
                  </div>

                  <ButtonWithIcon variant="hero" size="xl" className="w-full justify-center">
                    Send Message
                  </ButtonWithIcon>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
};

export default Contact;
