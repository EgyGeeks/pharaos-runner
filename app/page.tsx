"use client";

import { useEffect, useState, useRef } from "react";

type ObstacleType = "rock" | "temple" | "scorpion" | "snake" | "statue";

export default function PharaohRunner() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [, forceUpdate] = useState(0);
  const [achievedNewHighScore, setAchievedNewHighScore] = useState(false);
  const [bgOffset, setBgOffset] = useState(0);

  const playerYRef = useRef(0);
  const velocityRef = useRef(0);
  const isDuckingRef = useRef(false);
  const obstaclesRef = useRef<{ x: number; type: ObstacleType }[]>([]);
  const gameLoopRef = useRef<number | undefined>(undefined);
  const gameStartedRef = useRef(false);
  const gameOverRef = useRef(false);
  const pausedRef = useRef(false);
  const lastHighScoreRef = useRef(0);

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem("pharaosHighScore");
    if (saved) {
      const savedScore = parseInt(saved);
      setHighScore(savedScore);
      lastHighScoreRef.current = savedScore;
    }
  }, []);

  // Track and persist high scores
  useEffect(() => {
    // Mark that we achieved a new high score (but don't show celebration yet)
    if (gameStarted && score > lastHighScoreRef.current && score > 100) {
      setAchievedNewHighScore(true);
      setHighScore(score);
      lastHighScoreRef.current = score;
      localStorage.setItem("pharaosHighScore", score.toString());
    }
    // Also save current high score periodically
    if (score > 0 && score > highScore) {
      localStorage.setItem("pharaosHighScore", score.toString());
    }
  }, [score, gameStarted, highScore]);

  // Start game
  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setPaused(false);
    gameStartedRef.current = true;
    gameOverRef.current = false;
    pausedRef.current = false;
    setScore(0);
    setAchievedNewHighScore(false); // Reset high score flag
    playerYRef.current = 0;
    velocityRef.current = 0;
    isDuckingRef.current = false;
    obstaclesRef.current = [];
  };

  // Toggle pause
  const togglePause = () => {
    if (!gameStartedRef.current || gameOverRef.current) return;
    const newPaused = !pausedRef.current;
    setPaused(newPaused);
    pausedRef.current = newPaused;
  };

  // Jump
  const jump = () => {
    if (!gameStartedRef.current && !gameOverRef.current) {
      startGame();
      return;
    }
    if (gameOverRef.current || isDuckingRef.current) return;
    // Only jump if on the ground
    if (playerYRef.current === 0) {
      velocityRef.current = 13; // Slightly higher jump
    }
  };

  // Duck
  const setDuck = (ducking: boolean) => {
    if (!gameStartedRef.current || gameOverRef.current) return;
    isDuckingRef.current = ducking;
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to pause/resume
      if (e.code === "Escape") {
        e.preventDefault();
        togglePause();
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        // If game over, restart with space only
        if (gameOverRef.current) {
          startGame();
        } else if (pausedRef.current) {
          // If paused, resume with space
          togglePause();
        } else {
          // If playing, jump
          jump();
        }
      }

      if (e.code === "ArrowUp") {
        e.preventDefault();
        // ArrowUp only works during gameplay (not for restart/resume)
        if (!gameOverRef.current && !pausedRef.current) {
          jump();
        }
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        if (!pausedRef.current) {
          setDuck(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowDown") {
        setDuck(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Main game loop
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    let frameCount = 0;
    let lastObstacleFrame = -100;
    let obstacleCount = 0;

    const gameLoop = () => {
      // Check pause inside the loop
      if (pausedRef.current) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      frameCount++;

      // Apply gravity and velocity
      velocityRef.current -= 0.7; // Balanced gravity for natural jump arc
      playerYRef.current += velocityRef.current;

      // Keep player on ground
      if (playerYRef.current <= 0) {
        playerYRef.current = 0;
        velocityRef.current = 0;
      }

      // Progressive difficulty
      const currentScore = Math.floor(frameCount / 60); // Score in seconds
      const baseSpeed = 3.5 + Math.min(currentScore * 0.1, 6); // Start at 3.5, max 9.5
      const spawnInterval = Math.max(140 - currentScore * 2, 65); // Start at 140 frames, min 65

      // Spawn obstacles - random types
      if (frameCount - lastObstacleFrame > spawnInterval) {
        const rand = Math.random();
        let type: ObstacleType;

        if (rand < 0.3) type = "rock";
        else if (rand < 0.5) type = "scorpion";
        else if (rand < 0.7) type = "temple";
        else if (rand < 0.85) type = "statue";
        else type = "snake";

        obstaclesRef.current.push({ x: 800, type });
        lastObstacleFrame = frameCount;
        obstacleCount++;
      }

      // Move obstacles with progressive speed
      obstaclesRef.current = obstaclesRef.current
        .map((obs) => ({ ...obs, x: obs.x - baseSpeed }))
        .filter((obs) => obs.x > -100);

      // Collision detection with tighter hitboxes
      const playerX = 100;
      const playerWidth = 35; // Tighter hitbox
      const playerHeight = isDuckingRef.current ? 20 : 45;
      const playerBottom = playerYRef.current;
      const playerTop = playerBottom + playerHeight;

      let hasCollision = false;
      obstaclesRef.current.forEach((obs) => {
        const obsWidth = 35; // Tighter hitbox

        // Determine obstacle height and position
        let obsBottom = 0;
        let obsHeight = 35;

        if (obs.type === "temple" || obs.type === "statue" || obs.type === "snake") {
          // High obstacles - MUST DUCK (positioned high, even jumping won't help)
          // Starts at 35px and goes up to 115px - catches standing AND jumping players
          // Only ducking (0-20px) can avoid it
          obsBottom = 35;
          obsHeight = 80;
        } else {
          // Low obstacles (rock, scorpion) - MUST JUMP (positioned on ground, tall)
          // Starts at 0px, goes up to 40px - catches standing AND ducking players
          // Only jumping clears it
          obsBottom = 0;
          obsHeight = 40;
        }

        const obsTop = obsBottom + obsHeight;

        // X-axis collision with small margin
        const hitX = obs.x + 3 < playerX + playerWidth - 3 && obs.x + obsWidth - 3 > playerX + 3;

        // Y-axis collision with small margin
        const hitY = playerBottom + 2 < obsTop - 2 && playerTop - 2 > obsBottom + 2;

        if (hitX && hitY) {
          hasCollision = true;
        }
      });

      if (hasCollision) {
        setGameOver(true);
        gameOverRef.current = true;
      }

      // Score
      setScore((prev) => prev + 1);

      // Animate background
      setBgOffset((prev) => (prev + baseSpeed * 0.3) % 800);

      // Force re-render to show player movement
      forceUpdate((n) => n + 1);

      // Continue loop
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-900 via-amber-800 to-amber-950 flex items-center justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-4xl mx-auto">
        {/* Score */}
        <div className="absolute top-2 sm:top-4 left-4 sm:left-8 right-4 sm:right-8 flex justify-between text-amber-100 z-20">
          <div className="text-lg sm:text-2xl font-bold">👑 Pharaos Runner</div>
          <div className="text-right">
            <div className="text-base sm:text-xl font-bold">Score: {Math.floor(score / 10)}</div>
            <div className="text-xs sm:text-sm">High: {Math.floor(highScore / 10)}</div>
          </div>
        </div>

        {/* Game Canvas */}
        <div className="relative w-full h-80 sm:h-96 md:h-[28rem] bg-gradient-to-b from-orange-200/20 to-transparent border-2 sm:border-4 border-amber-600 rounded-lg mt-12 sm:mt-16 overflow-hidden">
          {/* Animated Background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Distant pyramids */}
            <div
              className="absolute top-32 left-0 right-0 flex opacity-20 will-change-transform"
              style={{
                transform: `translate3d(-${bgOffset * 0.3}px, 0, 0)`,
                transition: 'none'
              }}
            >
              {[...Array(20)].map((_, i) => (
                <div key={i} className="text-6xl mx-20 flex-shrink-0">🔺</div>
              ))}
            </div>
            {/* Palm trees */}
            <div
              className="absolute top-24 left-0 right-0 flex opacity-30 will-change-transform"
              style={{
                transform: `translate3d(-${bgOffset * 0.5}px, 0, 0)`,
                transition: 'none'
              }}
            >
              {[...Array(25)].map((_, i) => (
                <div key={i} className="text-4xl mx-16 flex-shrink-0">🌴</div>
              ))}
            </div>
            {/* Egyptian columns */}
            <div
              className="absolute top-16 left-0 right-0 flex opacity-25 will-change-transform"
              style={{
                transform: `translate3d(-${bgOffset * 0.7}px, 0, 0)`,
                transition: 'none'
              }}
            >
              {[...Array(20)].map((_, i) => (
                <div key={i} className="text-5xl mx-24 flex-shrink-0">🏛️</div>
              ))}
            </div>
          </div>

          {/* Ground */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-600"></div>
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-amber-700/30 to-transparent pointer-events-none"></div>

          {/* Player */}
          <div
            className="absolute text-5xl transition-none"
            style={{
              left: "100px",
              bottom: `${playerYRef.current}px`,
              transform: isDuckingRef.current ? "scaleY(0.5)" : "scaleY(1)",
              transformOrigin: "bottom",
            }}
          >
            🤴
          </div>

          {/* Obstacles */}
          {obstaclesRef.current.map((obs, i) => {
            const isHigh = obs.type === "temple" || obs.type === "statue" || obs.type === "snake";
            const emoji =
              obs.type === "rock" ? "🪨" :
              obs.type === "scorpion" ? "🦂" :
              obs.type === "temple" ? "🏛️" :
              obs.type === "statue" ? "🗿" :
              "🐍";

            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${obs.x}px`,
                  bottom: isHigh ? "35px" : "-4px", // Flying obstacles higher, ground obstacles stick to ground
                  fontSize: isHigh ? "5rem" : "3.5rem",
                  lineHeight: "1",
                }}
              >
                {emoji}
              </div>
            );
          })}

          {/* Start Screen */}
          {!gameStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 p-4">
              <div className="text-center space-y-4 sm:space-y-6">
                <div className="text-5xl sm:text-7xl">🤴</div>
                <h2 className="text-3xl sm:text-5xl font-black text-amber-100">Pharaos Runner</h2>
                <p className="text-base sm:text-lg text-amber-200">Jump 🪨🦂 or duck 🏛️🗿🐍 to survive!</p>
                <div className="text-amber-300 space-y-1 text-sm sm:text-base hidden lg:block">
                  <div>⌨️ SPACE or ↑ = Jump</div>
                  <div>⌨️ ↓ = Duck</div>
                  <div>⌨️ ESC = Pause</div>
                </div>
                <div className="text-amber-300 space-y-1 text-sm lg:hidden">
                  <div>Use buttons below to play!</div>
                </div>
                <button
                  onClick={startGame}
                  className="mt-4 px-8 sm:px-10 py-3 sm:py-4 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black text-lg sm:text-xl rounded-full hover:scale-105 active:scale-95 transition-transform shadow-lg"
                >
                  START GAME
                </button>
              </div>
            </div>
          )}

          {/* Pause Screen */}
          {paused && !gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 p-4">
              <div className="text-center space-y-4 sm:space-y-6">
                <div className="text-5xl sm:text-7xl">⏸️</div>
                <h2 className="text-3xl sm:text-5xl font-black text-amber-100">Paused</h2>
                <div className="text-amber-300 text-base sm:text-lg">
                  <div className="hidden lg:block">Press ESC or SPACE to resume</div>
                  <div className="lg:hidden">Tap to resume</div>
                </div>
                <button
                  onClick={togglePause}
                  className="lg:hidden mt-4 px-8 py-3 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black text-lg rounded-full active:scale-95 transition-transform shadow-lg"
                >
                  RESUME
                </button>
              </div>
            </div>
          )}

          {/* Game Over */}
          {gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-10 p-4">
              <div className="text-center space-y-4 max-w-md">
                {achievedNewHighScore ? (
                  <>
                    <div className="text-6xl animate-bounce">🎉</div>
                    <h2 className="text-3xl md:text-4xl font-black text-yellow-400 drop-shadow-lg animate-pulse">
                      NEW HIGH SCORE!
                    </h2>
                    <div className="text-amber-100 text-2xl">✨ {Math.floor(score / 10)} ✨</div>
                  </>
                ) : (
                  <>
                    <div className="text-5xl">💥</div>
                    <h2 className="text-3xl font-black text-red-400">Game Over!</h2>
                    <div className="text-amber-100 text-xl">Score: {Math.floor(score / 10)}</div>
                    <div className="text-amber-300 text-base">High: {Math.floor(highScore / 10)}</div>
                  </>
                )}
                <button
                  onClick={startGame}
                  className="mt-4 px-8 py-3 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black text-lg rounded-full hover:scale-105 transition-transform shadow-lg"
                >
                  PLAY AGAIN
                </button>
                <div className="text-amber-400 text-xs mt-2">
                  Press SPACE or click to play again
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Controls */}
        <div className="flex gap-3 justify-center mt-4 sm:mt-6 lg:hidden">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              jump();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              jump();
            }}
            className="flex-1 max-w-[160px] py-4 sm:py-6 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black text-lg sm:text-xl rounded-lg active:scale-95 transition-transform duration-75 shadow-lg select-none"
          >
            JUMP ↑
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setDuck(true);
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              setDuck(false);
            }}
            onMouseLeave={(e) => {
              setDuck(false);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              setDuck(true);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setDuck(false);
            }}
            className="flex-1 max-w-[160px] py-4 sm:py-6 bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black text-lg sm:text-xl rounded-lg active:scale-95 transition-transform duration-75 shadow-lg select-none"
          >
            DUCK ↓
          </button>
        </div>

        {/* Mobile Instructions */}
        <div className="text-center mt-3 text-amber-400 text-xs sm:text-sm lg:hidden">
          Tap buttons or use ESC to pause
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-amber-300">
          <p className="font-bold">A game by EgyGeeks</p>
          <p className="text-sm text-amber-400">Open-source. Egyptian roots. Global impact.</p>
        </div>
      </div>
    </div>
  );
}
