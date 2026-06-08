import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="gradient-hero flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-4xl flex-col items-center gap-12 md:flex-row md:items-center">
        {/* Left — Minion GIF */}
        <div className="flex flex-1 items-center justify-center">
          <img
            src="https://media.giphy.com/media/zBjObo9umi0wbrCRdP/giphy.gif"
            alt="Confused minion"
            className="w-64 drop-shadow-2xl md:w-80"
          />
        </div>

        {/* Right — Text */}
        <div className="flex flex-1 flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Error 404
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Bello! <br />
            <span className="text-primary">Lost in space.</span>
          </h1>

          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
            Even the minions couldn't find this page. It may have been moved, deleted, or never
            existed in the first place.
          </p>

          <Link
            to="/"
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:-translate-y-0.5 hover:shadow-primary/50 hover:brightness-110 active:translate-y-0"
          >
            <Home className="h-4 w-4" />
            Take me home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
