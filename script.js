document.addEventListener('DOMContentLoaded', () => {
    // --- Constantes Configurables ---
    const FEEDBACK_DELAY_MS = 1000; // Tiempo que se muestra el feedback (1 segundo)
    const MAX_ANSWER_LENGTH = 6;   // Máximos dígitos en la respuesta
    const TIMER_INTERVAL_MS = 1000; // Intervalo del timer (1 segundo)
    const PROBLEM_HISTORY_SIZE = 4; // Cuántos problemas recientes recordar para evitar repetición

    // Tiempos por racha (en segundos)
    const TIME_PER_STREAK = [
        { streak: 0, time: 10 },
        { streak: 5, time: 8 },
        { streak: 10, time: 6 },
        { streak: 15, time: 5 }
    ];

    // --- Estados del Juego ---
    const STATE_STARTUP = 0;
    const STATE_LEVEL_SELECT = 1;
    const STATE_PLAYING = 2;
    let currentGameState = STATE_STARTUP;

    // --- Niveles de dificultad ---
    const LEVEL_BASICO = 0;
    const LEVEL_MEDIO = 1;
    const LEVEL_MEDIO_ALTO = 2;
    const LEVEL_ALTO = 3;
    const LEVEL_AVANZADO = 4;
    const NUM_LEVELS = 5;
    let currentLevel = LEVEL_BASICO;

    const levelDetails = [
        { name: "Basico", description: "Nivel Basico (1-3)", range1: [1, 3], range2: [0, 10] },
        { name: "Medio", description: "Nivel Medio (4-5)", range1: [4, 5], range2: [0, 10] },
        { name: "Medio Alto", description: "Nivel Medio Alto (6-7)", range1: [6, 7], range2: [0, 10] },
        { name: "Alto", description: "Nivel Alto (8-9)", range1: [8, 9], range2: [0, 10] },
        { name: "Avanzado", description: "Nivel Avanzado (Mix)", range1: [10, 99], range2: [2, 9] }
    ];

    // --- Variables globales del Juego ---
    let num1, num2, correctAnswer;
    let consecutiveCorrect = 0;
    let highScores = new Array(NUM_LEVELS).fill(0);
    let problemHistory = []; // Array para guardar los últimos problemas {n1, n2}

    // --- Timers y estado ---
    let questionTimerInterval = null;
    let feedbackTimeout = null;
    let currentQuestionTime = TIME_PER_STREAK[0].time;
    let remainingTime = currentQuestionTime;
    let timerWasPaused = false; // VERDADERO solo si el modal pausó el juego

    // --- Detección de Dispositivo Táctil ---
    const isTouchDevice = ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    console.log(`Dispositivo táctil detectado: ${isTouchDevice}`);
    // --- FIN Detección ---

    // --- Referencias a Elementos del DOM (Cacheo) ---
    const startupScreen = document.getElementById('startup-screen');
    const levelSelectScreen = document.getElementById('level-select-screen');
    const gameScreen = document.getElementById('game-screen');
    const levelButtonsContainer = document.getElementById('level-buttons');
    const startButton = document.getElementById('start-button');

    const optionsButton = document.getElementById('options-button');
    const highscoreLabel = document.getElementById('highscore-label');
    const streakLabel = document.getElementById('streak-label');
    const problemLabel = document.getElementById('problem-label');
    const feedbackLabel = document.getElementById('feedback-label');
    const answerInput = document.getElementById('answer-input');
    const timerBar = document.getElementById('timer-bar');
    const keypad = document.getElementById('keypad');

    const levelModal = document.getElementById('level-modal');
    const modalLevelButtonsContainer = document.getElementById('modal-level-buttons');
    const closeModalButton = levelModal.querySelector('.close-button');

    // --- Funciones Auxiliares ---

    function randomInRange(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function showScreen(screenToShow) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        screenToShow.classList.add('active');
    }

    function updateScoreLabels() {
        if (currentLevel >= 0 && currentLevel < NUM_LEVELS) {
           const level = levelDetails[currentLevel];
           highscoreLabel.textContent = `Record (${level.name}): ${highScores[currentLevel]}`;
        }
        streakLabel.textContent = `Racha: ${consecutiveCorrect}`;
    }

    function loadHighScores() {
        const savedScores = localStorage.getItem('multiplicationQuizHighScores');
        if (savedScores) {
            try {
                const parsedScores = JSON.parse(savedScores);
                if (Array.isArray(parsedScores) && parsedScores.length === NUM_LEVELS) {
                    highScores = parsedScores;
                    return;
                }
                console.warn("High scores data invalid. Resetting.");
                localStorage.removeItem('multiplicationQuizHighScores');
            } catch (e) {
                console.error("Error parsing high scores:", e);
                localStorage.removeItem('multiplicationQuizHighScores');
            }
        }
        highScores = new Array(NUM_LEVELS).fill(0);
    }

    function saveLevelHighScore(level) {
        if (level >= 0 && level < NUM_LEVELS) {
            localStorage.setItem('multiplicationQuizHighScores', JSON.stringify(highScores));
        }
    }

    function resetFeedbackAndStyle() {
        if (feedbackTimeout) {
            clearTimeout(feedbackTimeout);
            feedbackTimeout = null;
        }
        feedbackLabel.textContent = '';
        feedbackLabel.className = 'feedback-label';
        answerInput.className = '';
    }

    // --- Funciones para Habilitar/Deshabilitar Input ---
    function disableInput() {
        answerInput.disabled = true;
        keypad.style.opacity = '0.5';
        keypad.style.pointerEvents = 'none';
    }

    function enableInput() {
        answerInput.disabled = false;
        keypad.style.opacity = '1';
        keypad.style.pointerEvents = 'auto';
    }
    // --- FIN Funciones Habilitar/Deshabilitar ---

    // --- Lógica del Temporizador ---

    function stopQuestionTimer() {
        if (questionTimerInterval) {
            clearInterval(questionTimerInterval);
            questionTimerInterval = null;
        }
    }

    function pauseQuestionTimer() {
        timerWasPaused = true;
        stopQuestionTimer();
        disableInput();
        console.log("Timer paused, input disabled.");
    }

    function resumeQuestionTimer() {
        if (timerWasPaused && currentGameState === STATE_PLAYING) {
            timerWasPaused = false;
            if (remainingTime > 0) {
                 startQuestionTimer(false);
                 enableInput();
                 console.log("Timer resumed, input enabled.");
                 if (!isTouchDevice) answerInput.focus();
            } else {
                 console.log("Timer not resumed (time was up).");
                 handleTimeUp();
            }
        }
    }

    function timerCountdown() {
        remainingTime--;
        const percentage = Math.max(0, (remainingTime / currentQuestionTime) * 100);
        timerBar.style.width = `${percentage}%`;
        if (remainingTime <= 0) {
            stopQuestionTimer();
            handleTimeUp();
        }
    }

    function getTimeForCurrentStreak() {
         for (let i = TIME_PER_STREAK.length - 1; i >= 0; i--) {
             if (consecutiveCorrect >= TIME_PER_STREAK[i].streak) {
                 return TIME_PER_STREAK[i].time;
             }
         }
         return TIME_PER_STREAK[0].time;
    }

    function startQuestionTimer(resetTime = true) {
        stopQuestionTimer();
        if (resetTime) {
             currentQuestionTime = getTimeForCurrentStreak();
             remainingTime = currentQuestionTime;
        } else {
             if (remainingTime < 0) remainingTime = 0;
        }
        const initialPercentage = Math.max(0, (remainingTime / currentQuestionTime) * 100);
        timerBar.style.width = `${initialPercentage}%`;
        if (remainingTime > 0) {
             questionTimerInterval = setInterval(timerCountdown, TIMER_INTERVAL_MS);
        } else {
             handleTimeUp();
        }
    }

    // --- Lógica del Juego ---

    function handleTimeUp() {
        if (currentGameState !== STATE_PLAYING || feedbackLabel.classList.contains('timeup')) return;
        console.log("Time's up!");
        stopQuestionTimer();
        timerWasPaused = false;
        disableInput();

        feedbackLabel.textContent = `¡Tiempo! Era ${correctAnswer}`;
        feedbackLabel.className = 'feedback-label timeup';
        answerInput.className = 'incorrect';

        consecutiveCorrect = 0;
        updateScoreLabels();
        timerBar.style.width = '0%';

        if (feedbackTimeout) clearTimeout(feedbackTimeout);
        feedbackTimeout = setTimeout(() => {
            feedbackTimeout = null;
            if (currentGameState === STATE_PLAYING) {
                 generateNewProblem();
            }
        }, FEEDBACK_DELAY_MS);
    }

    // --- VERSIÓN CON HISTORIAL PARA EVITAR REPETICIONES ---
    function generateNewProblem() {
        if (currentGameState !== STATE_PLAYING) return;

        let candidateNum1, candidateNum2;
        let isRecent = false;
        let attempts = 0; // Contador de seguridad

        // Bucle para encontrar un problema no reciente
        do {
            const level = levelDetails[currentLevel];
            candidateNum1 = randomInRange(level.range1[0], level.range1[1]);
            candidateNum2 = randomInRange(level.range2[0], level.range2[1]);

            // Comprobar si el par exacto está en el historial reciente
            isRecent = problemHistory.some(problem =>
                problem.n1 === candidateNum1 && problem.n2 === candidateNum2
            );

            attempts++;
            // Salir si no es reciente o si hemos intentado demasiado
            if (!isRecent || attempts > 50) {
                if (isRecent && attempts > 50) {
                     console.warn("No se pudo encontrar problema no reciente. Usando el último generado.");
                }
                break; // Salir del bucle
            }

        } while (true); // Se rompe con break

        // Usar los números encontrados
        num1 = candidateNum1;
        num2 = candidateNum2;
        correctAnswer = num1 * num2;

        // Actualizar el historial
        problemHistory.unshift({ n1: num1, n2: num2 });
        if (problemHistory.length > PROBLEM_HISTORY_SIZE) {
            problemHistory.pop();
        }
        // console.log("Historial:", problemHistory.map(p => `${p.n1}x${p.n2}`)); // Debug

        // Resto de la lógica (igual que antes)
        problemLabel.textContent = `${num1} x ${num2} = ?`;
        answerInput.value = "";
        resetFeedbackAndStyle();
        enableInput();
        if (!isTouchDevice) {
            answerInput.focus();
        }
        if (!timerWasPaused) {
             startQuestionTimer(true);
        } else {
             const percentage = Math.max(0, (remainingTime / currentQuestionTime) * 100);
             timerBar.style.width = `${percentage}%`;
        }
        updateScoreLabels();
    }
    // --- FIN VERSIÓN CON HISTORIAL ---

    function checkAnswer() {
        const userAnswerString = answerInput.value.trim();
        if (feedbackTimeout || remainingTime <= 0) return;

        stopQuestionTimer();
        timerWasPaused = false;
        disableInput();

        if (userAnswerString === "") {
             feedbackLabel.textContent = "¡Ingrese respuesta!";
             feedbackLabel.className = 'feedback-label info';
             startQuestionTimer(false);
             enableInput();
             if (!isTouchDevice) answerInput.focus();
             return;
        }
        const userAnswer = parseInt(userAnswerString, 10);
        if (isNaN(userAnswer)) {
             feedbackLabel.textContent = "¡Ingrese solo números!";
             feedbackLabel.className = 'feedback-label info';
             startQuestionTimer(false);
             enableInput();
             answerInput.value = '';
             if (!isTouchDevice) answerInput.focus();
             return;
         }

        let isCorrect = userAnswer === correctAnswer;
        if (isCorrect) {
             feedbackLabel.textContent = "¡Correcto!";
             feedbackLabel.className = 'feedback-label correct';
             answerInput.className = 'correct';
             consecutiveCorrect++;
             if (consecutiveCorrect > highScores[currentLevel]) {
                 highScores[currentLevel] = consecutiveCorrect;
                 saveLevelHighScore(currentLevel);
             }
        } else {
             feedbackLabel.textContent = `Incorrecto. Era ${correctAnswer}`;
             feedbackLabel.className = 'feedback-label incorrect';
             answerInput.className = 'incorrect';
             consecutiveCorrect = 0;
        }

        updateScoreLabels();

        if (feedbackTimeout) clearTimeout(feedbackTimeout);
        feedbackTimeout = setTimeout(() => {
            feedbackTimeout = null;
            if (currentGameState === STATE_PLAYING) {
                generateNewProblem();
            }
        }, FEEDBACK_DELAY_MS);
    }

    // --- Manejadores de Eventos ---

    keypad.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' || answerInput.disabled) return;
        const key = e.target.dataset.key;
        if (key !== 'OK') { resetFeedbackAndStyle(); }
        if (key >= '0' && key <= '9') { if (answerInput.value.length < MAX_ANSWER_LENGTH) answerInput.value += key; }
        else if (key === 'BKSP') { answerInput.value = answerInput.value.slice(0, -1); }
        else if (key === 'OK') { checkAnswer(); }
    });

    answerInput.addEventListener('input', () => {
        if (answerInput.readOnly || answerInput.disabled) {
             if(answerInput.readOnly && answerInput.value.length > 0) {
                 answerInput.value = answerInput.value.slice(0,-1);
             }
             return;
        }
        resetFeedbackAndStyle();
        if (answerInput.value.length > MAX_ANSWER_LENGTH) {
            answerInput.value = answerInput.value.slice(0, MAX_ANSWER_LENGTH);
        }
    });

    answerInput.addEventListener('keydown', (event) => {
         if (answerInput.disabled || answerInput.readOnly || currentGameState !== STATE_PLAYING) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            checkAnswer();
        }
    });

    startButton.addEventListener('click', () => { currentGameState = STATE_LEVEL_SELECT; populateLevelButtons(levelButtonsContainer, handleInitialLevelSelect); showScreen(levelSelectScreen); });
    optionsButton.addEventListener('click', () => { if (currentGameState !== STATE_PLAYING) return; pauseQuestionTimer(); levelModal.style.display = 'block'; });
    closeModalButton.addEventListener('click', () => { levelModal.style.display = 'none'; resumeQuestionTimer(); });
    window.addEventListener('click', (event) => { if (event.target == levelModal) { levelModal.style.display = 'none'; resumeQuestionTimer(); } });

    // --- Funciones de Configuración de UI ---

    function handleInitialLevelSelect(levelIndex) {
         currentLevel = levelIndex;
         currentGameState = STATE_PLAYING;
         consecutiveCorrect = 0;
         timerWasPaused = false;
         problemHistory = []; // Limpiar historial al empezar nuevo juego/nivel
         if (!highScores || highScores.length !== NUM_LEVELS) loadHighScores();
         populateLevelButtons(modalLevelButtonsContainer, handleModalLevelSelect);
         showScreen(gameScreen);
         generateNewProblem();
    }

    function handleModalLevelSelect(levelIndex) {
         levelModal.style.display = 'none';
         if (levelIndex !== currentLevel) {
             currentLevel = levelIndex;
             consecutiveCorrect = 0;
             timerWasPaused = false;
             problemHistory = []; // Limpiar historial al cambiar de nivel
             generateNewProblem();
         } else {
             resumeQuestionTimer();
         }
    }

    function populateLevelButtons(container, clickHandler) {
        container.innerHTML = '';
        levelDetails.forEach((level, index) => {
            const button = document.createElement('button');
            button.textContent = level.description;
            button.addEventListener('click', () => clickHandler(index));
            container.appendChild(button);
        });
    }

    // --- Inicialización ---
    function init() {
        console.log("Initializing Quiz...");
        loadHighScores();
        currentGameState = STATE_STARTUP;
        if (isTouchDevice) {
            answerInput.readOnly = true;
        } else {
            answerInput.readOnly = false;
        }
        disableInput(); // Input deshabilitado al inicio
        showScreen(startupScreen);
    }

    init(); // Ejecutar inicialización

}); // Fin del DOMContentLoaded
