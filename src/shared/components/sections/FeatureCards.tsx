import { motion } from "framer-motion";
import { BarChart3, Trophy, Sparkles, TrendingUp, Search } from "lucide-react";

const features = [
  {
    title: "Smart Progress Tracking",
    description: "Monitor student performance with in-depth analytics and reports.",
    icon: BarChart3,
    mockContent: "chart",
  },
  {
    title: "Gamification & Rewards",
    description: "Excite users with badges, leaderboards, and achievements!",
    icon: Trophy,
    mockContent: "leaderboard",
  },
  {
    title: "AI-Powered Learning",
    description: "Get personalized course recommendations and automated progress tracking.",
    icon: Sparkles,
    mockContent: "ai",
  },
];

export function FeatureCards() {
  return (
    <section className="section-padding">
      <div className="container-main">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="hover-lift group cursor-pointer rounded-3xl border border-border bg-card p-6 shadow-soft lg:p-8"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <h3 className="mb-3 text-xl font-bold lg:text-2xl">{feature.title}</h3>
              <p className="mb-6 text-muted-foreground">{feature.description}</p>

              {/* Mock Content */}
              <div className="min-h-[180px] rounded-2xl bg-muted p-4">
                {feature.mockContent === "chart" && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Time Spent</div>
                    <div className="mb-4 text-2xl font-bold text-primary">13.6 Hours</div>
                    <div className="flex h-24 items-end gap-1">
                      {[40, 60, 30, 80, 45, 70, 55, 90, 50, 65, 75, 40].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-primary/30 transition-colors duration-300 group-hover:bg-primary"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {feature.mockContent === "leaderboard" && (
                  <div>
                    <div className="mb-4 font-semibold">Leader Board</div>
                    <div className="mb-2 grid grid-cols-3 text-xs text-muted-foreground">
                      <span>RANK</span>
                      <span>NAME</span>
                      <span className="text-right">POINT</span>
                    </div>
                    {[
                      { rank: 1, name: "Jacob Jones", points: "13,450", up: true },
                      { rank: 2, name: "Kristin Watson", points: "11,236", up: false },
                      { rank: 3, name: "Alan Walker", points: "08,164", up: false },
                    ].map((user) => (
                      <div key={user.rank} className="grid grid-cols-3 items-center py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.rank}</span>
                          <TrendingUp
                            className={`h-3 w-3 ${user.up ? "text-green-500" : "rotate-180 text-red-500"}`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/20" />
                          <span className="truncate">{user.name}</span>
                        </div>
                        <span className="text-right font-medium text-primary">{user.points}</span>
                      </div>
                    ))}
                  </div>
                )}

                {feature.mockContent === "ai" && (
                  <div>
                    <div className="mb-4 font-semibold">AI - Recommendation</div>
                    <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
                      <span className="truncate text-sm text-muted-foreground">
                        Business Category
                      </span>
                      <Search className="ml-auto h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center justify-center py-4">
                      <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-primary/20">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="mx-auto h-2 w-3/4 rounded-full bg-border" />
                      <div className="mx-auto h-2 w-1/2 rounded-full bg-border" />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
