"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Columns3,
  Eye,
  FileText,
  GitBranch,
  GitPullRequest,
  Globe,
  Link2,
  Lock,
  MapPin,
  Share2,
  ShieldCheck,
  Smartphone,
  Tag,
  Users,
} from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import { useT, LanguageToggle } from "@/i18n";

const REPO_URL = "https://github.com/Kuisin/swimlane-cloud";

/**
 * The public top page. Everything it claims is something the product does
 * today — there are no placeholder logos, invented customers or unshipped
 * features, because the first thing a visitor does is sign in and check.
 */
export default function LandingPage() {
  const { t } = useT();

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <main>
        <Hero />
        <TwoEditors />
        <Workflow />
        <Features />
        <Trust />
        <Plans />
        <Faq />
        <Closing />
      </main>
      <footer className="border-t border-neutral-200 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 text-sm text-neutral-500 sm:flex-row">
          <span>
            © {new Date().getFullYear()} Swimlane Cloud · {t("landing.footer.rights")}
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-neutral-800"
          >
            <GitHubMark className="h-4 w-4" />
            {t("landing.footer.source")}
          </a>
        </div>
      </footer>
    </div>
  );
}

function SiteHeader() {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-6">
        <span className="font-semibold tracking-tight">Swimlane Cloud</span>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            <GitHubMark className="h-4 w-4" />
            <span className="hidden sm:inline">{t("landing.signIn")}</span>
            <span className="sm:hidden">GitHub</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Section({
  id,
  title,
  lead,
  children,
  tint = false,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <section id={id} className={tint ? "border-y border-neutral-200 bg-neutral-50" : ""}>
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {lead && <p className="mt-3 max-w-3xl text-neutral-600">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Hero() {
  const { t } = useT();
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pb-24 sm:pt-20">
      <p className="text-sm font-medium uppercase tracking-widest text-indigo-600">
        {t("landing.tagline")}
      </p>
      <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        {t("landing.headline")}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutral-600">
        {t("landing.description")}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          <GitHubMark className="h-4 w-4" />
          {t("landing.ctaPrimary")}
        </Link>
        <a
          href="#how"
          className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-semibold hover:bg-neutral-50"
        >
          {t("landing.ctaSecondary")} <ArrowRight size={15} />
        </a>
        <Link href="/dashboard" className="px-2 text-sm text-neutral-500 hover:underline">
          {t("landing.openDashboard")}
        </Link>
      </div>

      <p className="mt-5 max-w-xl text-sm text-neutral-500">{t("landing.heroNote")}</p>

      <DiagramSketch />
    </section>
  );
}

/**
 * A small inline illustration of the format: lanes down the side, steps
 * flowing through them. Drawn rather than screenshotted so it stays sharp and
 * costs no image request.
 */
function DiagramSketch() {
  const lanes = [
    { name: "Requester", tone: "bg-indigo-100 text-indigo-800" },
    { name: "Manager", tone: "bg-emerald-100 text-emerald-800" },
    { name: "Finance", tone: "bg-amber-100 text-amber-800" },
  ];
  const steps = [
    { lane: 0, label: "Submit expense" },
    { lane: 1, label: "Review" },
    { lane: 2, label: "Reimburse" },
  ];
  return (
    <div
      aria-hidden
      className="mt-12 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-6"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {lanes.map((lane, i) => (
          <div key={lane.name} className="rounded-lg border border-neutral-200 bg-white p-3">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${lane.tone}`}>
              {lane.name}
            </span>
            <div className="mt-3 space-y-2">
              {steps
                .filter((s) => s.lane === i)
                .map((s) => (
                  <div
                    key={s.label}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    {s.label}
                  </div>
                ))}
              {steps.every((s) => s.lane !== i) && (
                <div className="h-9 rounded-md border border-dashed border-neutral-200" />
              )}
            </div>
          </div>
        ))}
      </div>
      {/* A complete, valid document — the same DSL the editor and the renderer
          accept, not an illustrative fragment. */}
      <pre className="mt-4 overflow-x-auto rounded-md bg-neutral-900 p-4 font-mono text-xs leading-relaxed text-neutral-100">
        {`@kai-swimlane
/title/
Expense approval
/role/
<requester>
label: Requester;
<manager>
label: Manager;
<finance>
label: Finance;
/line/
[requester: Submit expense]
[manager: Review]
[finance: Reimburse]
@end`}
      </pre>
    </div>
  );
}

function TwoEditors() {
  const { t } = useT();
  const items = [
    { icon: Columns3, title: t("landing.what.gui"), desc: t("landing.what.guiDesc") },
    { icon: FileText, title: t("landing.what.text"), desc: t("landing.what.textDesc") },
    { icon: Eye, title: t("landing.what.preview"), desc: t("landing.what.previewDesc") },
  ];
  return (
    <Section title={t("landing.what.title")} lead={t("landing.what.lead")} tint>
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-neutral-200 bg-white p-6">
            <Icon size={20} className="text-indigo-600" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Workflow() {
  const { t } = useT();
  const steps = [
    { icon: Link2, title: t("landing.flow.s1"), desc: t("landing.flow.s1Desc") },
    { icon: FileText, title: t("landing.flow.s2"), desc: t("landing.flow.s2Desc") },
    { icon: Check, title: t("landing.flow.s3"), desc: t("landing.flow.s3Desc") },
    { icon: GitPullRequest, title: t("landing.flow.s4"), desc: t("landing.flow.s4Desc") },
    { icon: Tag, title: t("landing.flow.s5"), desc: t("landing.flow.s5Desc") },
    { icon: Share2, title: t("landing.flow.s6"), desc: t("landing.flow.s6Desc") },
  ];
  return (
    <Section id="how" title={t("landing.flow.title")} lead={t("landing.flow.lead")}>
      <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(({ icon: Icon, title, desc }, i) => (
          <li key={title} className="relative border-l-2 border-neutral-200 pl-5">
            <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <h3 className="flex items-center gap-2 font-semibold">
              <Icon size={16} className="text-indigo-600" />
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs sm:text-sm">
        <Branch name="tmp-*" tone="bg-neutral-200 text-neutral-700" />
        <ArrowRight size={14} className="text-neutral-400" />
        <Branch name="test" tone="bg-amber-100 text-amber-800" />
        <ArrowRight size={14} className="text-neutral-400" />
        <Branch name="main" tone="bg-emerald-100 text-emerald-800" />
        <span className="ml-2 font-sans text-xs text-neutral-500">
          {t("landing.flow.branches")}
        </span>
      </div>
    </Section>
  );
}

function Branch({ name, tone }: { name: string; tone: string }) {
  return (
    <span className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium ${tone}`}>
      <GitBranch size={13} />
      {name}
    </span>
  );
}

function Features() {
  const { t } = useT();
  const items = [
    { icon: Columns3, title: t("landing.features.editor"), desc: t("landing.features.editorDesc") },
    {
      icon: Lock,
      title: t("landing.features.templates"),
      desc: t("landing.features.templatesDesc"),
    },
    { icon: GitBranch, title: t("landing.features.git"), desc: t("landing.features.gitDesc") },
    { icon: Users, title: t("landing.features.roles"), desc: t("landing.features.rolesDesc") },
    { icon: Tag, title: t("landing.features.versions"), desc: t("landing.features.versionsDesc") },
    {
      icon: Smartphone,
      title: t("landing.features.mobile"),
      desc: t("landing.features.mobileDesc"),
    },
    { icon: FileText, title: t("landing.features.export"), desc: t("landing.features.exportDesc") },
    { icon: Globe, title: t("landing.features.i18n"), desc: t("landing.features.i18nDesc") },
  ];
  return (
    <Section title={t("landing.features.title")} tint>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border border-neutral-200 bg-white p-5">
            <Icon size={18} className="text-indigo-600" />
            <h3 className="mt-3 text-sm font-semibold leading-snug">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Trust() {
  const { t } = useT();
  const items = [
    { icon: GitHubMark, title: t("landing.trust.source"), desc: t("landing.trust.sourceDesc") },
    { icon: ShieldCheck, title: t("landing.trust.token"), desc: t("landing.trust.tokenDesc") },
    { icon: Lock, title: t("landing.trust.db"), desc: t("landing.trust.dbDesc") },
    { icon: MapPin, title: t("landing.trust.region"), desc: t("landing.trust.regionDesc") },
  ];
  return (
    <Section title={t("landing.trust.title")}>
      <div className="grid gap-6 sm:grid-cols-2">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-4">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Plans() {
  const { t } = useT();
  const plans = [
    {
      name: t("landing.plans.free"),
      price: t("landing.plans.freePrice"),
      for: t("landing.plans.freeFor"),
      features: [t("landing.plans.freeF1"), t("landing.plans.freeF2"), t("landing.plans.freeF3")],
      highlight: true,
    },
    {
      name: t("landing.plans.team"),
      price: t("landing.plans.teamPrice"),
      for: t("landing.plans.teamFor"),
      features: [t("landing.plans.teamF1"), t("landing.plans.teamF2"), t("landing.plans.teamF3")],
      highlight: false,
    },
    {
      name: t("landing.plans.enterprise"),
      price: t("landing.plans.enterprisePrice"),
      for: t("landing.plans.enterpriseFor"),
      features: [
        t("landing.plans.enterpriseF1"),
        t("landing.plans.enterpriseF2"),
        t("landing.plans.enterpriseF3"),
      ],
      highlight: false,
    },
  ];
  return (
    <Section title={t("landing.plans.title")} lead={t("landing.plans.lead")} tint>
      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`rounded-xl border bg-white p-6 ${
              p.highlight ? "border-indigo-300 ring-1 ring-indigo-200" : "border-neutral-200"
            }`}
          >
            <h3 className="font-semibold">{p.name}</h3>
            <p className="mt-2 text-2xl font-bold tracking-tight">{p.price}</p>
            <p className="mt-2 text-sm text-neutral-600">{p.for}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span className="text-neutral-700">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Faq() {
  const { t } = useT();
  const qa = [1, 2, 3, 4, 5, 6].map((n) => ({
    q: t(`landing.faq.q${n}`),
    a: t(`landing.faq.a${n}`),
  }));
  return (
    <Section title={t("landing.faq.title")}>
      <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {qa.map(({ q, a }) => (
          <div key={q}>
            <dt className="font-semibold">{q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-neutral-600">{a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Closing() {
  const { t } = useT();
  return (
    <section className="border-t border-neutral-200 bg-neutral-900">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {t("landing.closing.title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-neutral-300">{t("landing.closing.lead")}</p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
        >
          <GitHubMark className="h-4 w-4" />
          {t("landing.ctaPrimary")}
        </Link>
      </div>
    </section>
  );
}
