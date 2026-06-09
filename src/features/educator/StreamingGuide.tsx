import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { steps } from "@shared/data/data";

export default function StreamingGuide() {
  const navigate = useNavigate();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="relative space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/educator/live-classes")}
          className="hidden rounded-full hover:bg-primary md:flex"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OBS Streaming Setup Guide</h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            Complete walkthrough for live broadcasting using YouTube Live and OBS Studio
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Sticky Sidebar Navigation */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6 hidden border-border/60 shadow-soft lg:block">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Quick Navigation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 p-3 pt-0">
              {steps.map((step) => (
                <a
                  key={step.id}
                  href={`#${step.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                    {step.num}
                  </span>
                  <span className="truncate">{step.title}</span>
                </a>
              ))}
              <hr className="my-2 border-border" />
              <a
                href="#best-practices"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary/80 transition-all hover:bg-muted hover:text-primary"
              >
                <CheckCircle className="h-4 w-4 text-primary" />
                Best Practices
              </a>
              <a
                href="#troubleshooting"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600/80 transition-all hover:bg-muted hover:text-red-600"
              >
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Troubleshooting
              </a>
            </CardContent>
          </Card>
        </div>

        {/* Content Details */}
        <div className="space-y-6 lg:col-span-3">
          {/* Welcome Card */}
          <Card className="overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent shadow-soft">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-primary">
                🎥 How to Set Up YouTube Live Streaming with OBS Studio
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Welcome! This step-by-step guide will assist you in configuring OBS Studio and
                linking it to your YouTube channel. Follow these steps carefully to ensure a
                high-definition, delay-free experience for your students.
              </p>
            </CardContent>
          </Card>

          {/* Steps */}
          <div className="space-y-6">
            {steps.map((step) => (
              <Card
                key={step.id}
                id={step.id}
                className="scroll-mt-6 border-border/50 shadow-soft transition-all duration-200 hover:border-primary/25 hover:shadow-card"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {step.num}
                    </span>
                    <div className="flex items-center gap-2">
                      {step.icon}
                      <CardTitle className="text-base font-bold text-foreground">
                        {step.title}
                      </CardTitle>
                    </div>
                  </div>
                  <CardDescription className="pl-10 text-xs text-muted-foreground">
                    {step.desc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pl-10">
                  <ul className="list-inside list-decimal space-y-2 text-xs leading-relaxed text-muted-foreground">
                    {step.instructions.map((inst, index) => (
                      <li key={index} className="pl-1">
                        <span className="text-foreground">{inst}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Optional External Link Button */}
                  {step.link && (
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        asChild
                      >
                        <a
                          href={step.link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {step.linkText}
                        </a>
                      </Button>
                    </div>
                  )}

                  {/* Stream key configuration details */}
                  {step.codeBlocks && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {step.codeBlocks.map((block, i) => (
                        <div key={i} className="rounded-lg border bg-muted/30 p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {block.label}
                            </span>
                            <button
                              onClick={() => handleCopy(block.value, `${step.id}_code_${i}`)}
                              className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {copiedText === `${step.id}_code_${i}` ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="mt-1 select-all truncate font-mono text-[11px] text-foreground">
                            {block.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {step.isWarning && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-amber-800">
                      <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600" />
                      <p className="text-[11px] font-medium leading-relaxed">{step.warningText}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Best Practices Section */}
          <Card
            id="best-practices"
            className="scroll-mt-6 border border-emerald-100 bg-emerald-50/20 shadow-soft"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-base font-bold">
                  During the Class: Best Practices
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 text-xs text-emerald-800/90 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <span>✅</span> Use a stable internet connection.
                </div>
                <div className="flex items-center gap-2">
                  <span>✅</span> Close unnecessary desktop apps.
                </div>
                <div className="flex items-center gap-2">
                  <span>✅</span> Test your mic before starting.
                </div>
                <div className="flex items-center gap-2">
                  <span>✅</span> Keep OBS open during streaming.
                </div>
                <div className="flex items-center gap-2">
                  <span>✅</span> Monitor student chat regularily.
                </div>
                <div className="flex items-center gap-2">
                  <span>✅</span> Use a headset to prevent echoes.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Troubleshooting Section */}
          <Card
            id="troubleshooting"
            className="scroll-mt-6 border border-red-100 bg-red-50/20 shadow-soft"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-base font-bold">Troubleshooting Common Issues</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-red-100/50">
              <div className="py-2.5 first:pt-0">
                <h4 className="text-xs font-bold text-red-950">Students Cannot See the Stream</h4>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-red-900/80">
                  <li>
                    Verify OBS is active and currently transmitting data (check bottom status bar).
                  </li>
                  <li>Verify the RTMP Server URL matches exactly.</li>
                  <li>Verify the Stream Key matches and has no typos.</li>
                  <li>Wait 15-30 seconds after starting stream for YouTube to catch up.</li>
                </ul>
              </div>
              <div className="py-2.5">
                <h4 className="text-xs font-bold text-red-950">No Audio Output</h4>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-red-900/80">
                  <li>Check operating system microphone security/privacy permissions.</li>
                  <li>
                    Verify your microphone is selected as the default Mic device in OBS Audio
                    Settings.
                  </li>
                  <li>Check that the mic volume bar is moving in the Audio Mixer panel.</li>
                </ul>
              </div>
              <div className="py-2.5">
                <h4 className="text-xs font-bold text-red-950">Stream Quality Is Poor / Laggy</h4>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-red-900/80">
                  <li>
                    Check your internet upload speed (should be at least 8-10 Mbps for stable
                    1080p).
                  </li>
                  <li>Try reducing the video resolution to 1280x720 in OBS Video settings.</li>
                  <li>Lower the stream output bitrate to 3000-3500 Kbps.</li>
                  <li>Use a wired Ethernet cable connection instead of Wi-Fi.</li>
                </ul>
              </div>
              <div className="py-2.5 last:pb-0">
                <h4 className="text-xs font-bold text-red-950">
                  OBS Displays "Disconnected" Error
                </h4>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-red-900/80">
                  <li>Verify your local internet router is connected.</li>
                  <li>Make sure no firewall rules are blocking outgoing RTMP ports.</li>
                  <li>Refresh the Stream Key from the portal and update settings in OBS.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Need Help Card */}
          <Card className="border-border/60 bg-muted/20 shadow-soft">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-bold">Need Help?</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground">
              If you continue to experience streaming issues, please contact platform support.
              Please provide:
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>A screenshot of your OBS settings (Stream and Video tabs).</li>
                <li>A screenshot of any error messages displayed in OBS.</li>
                <li>The Class Title and scheduled time.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Inline fallback Key icon in case Lucide version mismatch
function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3" />
      <path d="m18 5 3 3" />
    </svg>
  );
}
