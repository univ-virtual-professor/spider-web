import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Instagram, Linkedin, Facebook, Mail, Phone } from "lucide-react";

const footerLinks = {
  product: [
    { name: "Home", path: "/" },
    { name: "Features", path: "/features" },
    { name: "Pricing", path: "/pricing" },
  ],
  resources: [
    { name: "Contact Us", path: "/contact" },
    { name: "Terms & Conditions", path: "/terms" },
    { name: "Privacy Policy", path: "/privacy" },
    { name: "Refunds & Cancellations", path: "/refunds" },
  ],
};

const socialLinks = [
  { name: "Instagram", icon: Instagram, href: "#" },
  { name: "LinkedIn", icon: Linkedin, href: "#" },
  { name: "Facebook", icon: Facebook, href: "#" },
];

const Footer = forwardRef<HTMLElement>((_, ref) => {
  return (
    <footer ref={ref} className="relative overflow-hidden bg-foreground text-background">
      {/* Large watermark text */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 select-none overflow-hidden">
        <div className="whitespace-nowrap text-[15vw] font-bold leading-none tracking-tight text-background/5">
          UNIV
        </div>
      </div>

      <div className="container-main relative z-10 py-16 lg:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link to="/" className="mb-5 flex items-center">
              <img src="/logo.png" alt="Preparekaro.in" className="h-10 w-auto invert" />
            </Link>
            <p className="mb-4 text-lg font-medium text-background/90">Tayaari Exam Jaisi</p>
            <p className="mb-6 text-sm leading-relaxed text-background/70">
              Launch your own CUET test platform in minutes. Built specifically for coaching
              centers.
            </p>

            {/* Contact info */}
            <div className="mb-6 space-y-2">
              <a
                href="tel:+919625394589"
                className="flex items-center gap-2 text-sm text-background/70 transition-colors hover:text-primary"
              >
                <Phone className="h-4 w-4" />
                +91 96253 94589
              </a>
              <a
                href="mailto:info.univlive@gmail.com"
                className="flex items-center gap-2 text-sm text-background/70 transition-colors hover:text-primary"
              >
                <Mail className="h-4 w-4" />
                info.univlive@gmail.com
              </a>
            </div>

            <p className="text-xs text-background/50">
              © {new Date().getFullYear()} Preparekaro.in. All rights reserved.
            </p>
          </div>

          {/* Useful Links */}
          <div>
            <h4 className="mb-5 font-semibold text-background">Useful Links</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.path}
                    className="text-sm text-background/70 transition-colors hover:text-primary"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-5 font-semibold text-background">Quick Links</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.path}
                    className="text-sm text-background/70 transition-colors hover:text-primary"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social Links */}
          <div>
            <h4 className="mb-5 font-semibold text-background">Let's Connect</h4>
            <ul className="space-y-3">
              {socialLinks.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 text-sm text-background/70 transition-colors hover:text-primary"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/10 transition-colors group-hover:bg-primary/20">
                      <link.icon className="h-4 w-4" />
                    </span>
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;
