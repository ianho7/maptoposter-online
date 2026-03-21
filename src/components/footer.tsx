// import { useState } from "react";
import {
  Star,
  // Mail,
  Link,
} from "lucide-react";
import * as m from "@/paraglide/messages";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const REPO_URL = "https://github.com/ianho7/maptoposter-online";

export default function Footer() {
  // const [emailCopied, setEmailCopied] = useState(false);

  // const handleCopyEmail = () => {
  //     navigator.clipboard.writeText("hello@mapposter.online");
  //     setEmailCopied(true);
  //     setTimeout(() => setEmailCopied(false), 2000);
  // };

  const currentYear = new Date().getFullYear();

  return (
    <footer>
      <div className="max-w-6xl mx-auto px-6 pt-6 border-t border-gray-200">
        {/* ── Main grid: 2 columns ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Col 1: Project links */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {m.footer_project()}
            </h3>
            <ul className="space-y-2.5">
              {[
                { label: m.footer_github_repo(), href: REPO_URL },
                { label: m.footer_submit_issue(), href: `${REPO_URL}/issues` },
                // { label: m.footer_feature_suggestions(), href: `${REPO_URL}/discussions` },
                { label: m.footer_changelog(), href: `${REPO_URL}/releases` },
              ].map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors duration-150 group w-fit"
                  >
                    {item.label}
                    <Link className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2: Contact + OSS card */}
          <div className="space-y-6">
            {/* <div className="space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9B9490]">
                                {m.footer_contact()}
                            </h3>
                            <button
                                onClick={handleCopyEmail}
                                className="flex items-center gap-2.5 text-sm text-[#6B6560] hover:text-[#1A1A1A] transition-colors duration-150 group cursor-pointer bg-transparent border-0 p-0"
                            >
                                <div className="w-7 h-7 rounded-md bg-[#EDE8E3] flex items-center justify-center group-hover:bg-[#E8341C] transition-colors duration-200">
                                    <Mail className="w-3.5 h-3.5 group-hover:text-white transition-colors" />
                                </div>
                                <span className="font-mono text-xs">
                                    {emailCopied ? `✓ ${m.footer_email_copied()}` : "hello@mapposter.online"}
                                </span>
                            </button>
                        </div> */}

            {/* OSS card */}
            <div className="border border-gray-200 bg-white px-4 py-4 space-y-2">
              <div className="flex items-center gap-2">
                <GithubIcon className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-primary">{m.footer_open_source()}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {m.footer_open_source_desc()}
              </p>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Star className="w-3.5 h-3.5" />
                {m.footer_star_on_github()}
              </a>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>
            © {currentYear} Map To Poster · {m.footer_data_source()}{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors underline underline-offset-2"
            >
              OpenStreetMap
            </a>{" "}
            {m.footer_contributors()}
          </span>
        </div>
      </div>
    </footer>
  );
}
