import { motion } from "framer-motion";
import { Bezel } from "../components/Bezel";
import { Button } from "../components/ui";
import { IconArrow, IconPlay } from "../icons";
import { useStore } from "../store";

const stagger = { animate: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const rise = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 18 } },
};

export function Welcome() {
  const { go } = useStore();
  return (
    <div id="welcome-bg">
      <div className="w-nav">
        <div className="mark"><i />Frame</div>
        <nav>
          <a onClick={() => go("library")}>Library</a>
          <a>Docs</a>
          <a>Account</a>
        </nav>
      </div>

      <motion.div className="hero" variants={stagger} initial="initial" animate="animate">
        <div>
          <motion.div variants={rise} className="kicker" style={{ marginBottom: 18 }}>
            Documentary studio
          </motion.div>
          <motion.h1 variants={rise}>
            Tell true stories,<br /><span className="em">frame by frame.</span>
          </motion.h1>
          <motion.p variants={rise}>
            Bring a script, a topic, or your own voice. Frame writes, sources, and
            cuts a finished documentary — and walks you through the few choices that
            are actually yours to make.
          </motion.p>
          <motion.div variants={rise} className="cta">
            <Button variant="accent" onClick={() => go("new")}>
              Start a new film <IconArrow />
            </Button>
            <Button variant="ghost" onClick={() => go("library")}>
              <IconPlay style={{ width: 16, height: 16 }} /> See an example
            </Button>
          </motion.div>
        </div>

        <motion.div variants={rise}>
          <Bezel caption={<>The numbers were <em>unremarkable.</em></>} />
        </motion.div>
      </motion.div>
    </div>
  );
}
