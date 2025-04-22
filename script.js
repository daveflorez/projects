document.addEventListener('DOMContentLoaded', () => {
  // --- Constantes Configurables ---
  const FEEDBACK_DELAY_MS = 800; // Tiempo que se muestra el feedback
  const MAX_ANSWER_LENGTH = 6;   // Máximos dígitos en la respuesta
  const TIMER_INTERVAL_MS = 1000; // Intervalo del timer (1 segundo)

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
  // 'currentAnswerString' ya no es la fuente principal, pero puede usarse si se necesita
  // let currentAnswerString = "";

  // --- Timers y estado ---
  let questionTimerInterval = null;
  let feedbackTimeout = null;
  let currentQuestionTime = TIME_PER_STREAK[0].time; // Tiempo inicial
  let remainingTime = currentQuestionTime;
  let timerWasPaused = false; // VERDADERO solo si el modal pausó el juego

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
  const answerInput = document.getElementById('answer-input'); // Referencia clave
  const timerBar = document.getElementById('timer-bar');
  const keypad = document.getElementById('keypad'); // Referencia al contenedor del keypad

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
              console.warn("High scores data in localStorage is invalid. Resetting.");
              localStorage.removeItem('multiplicationQuizHighScores');
          } catch (e) {
              console.error("Error parsing high scores from localStorage:", e);
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
      answerInput.className = ''; // Quita clases de estilo (correcto/incorrecto)
      // No modificamos answerInput.value aquí para no interferir con la escritura del usuario
  }

  // --- Funciones para Habilitar/Deshabilitar Input ---
  function disableInput() {
      answerInput.disabled = true;
      // Atenuar keypad virtual y deshabilitar clicks
      keypad.style.opacity = '0.5';
      keypad.style.pointerEvents = 'none';
  }

  function enableInput() {
      answerInput.disabled = false;
      // Restaurar keypad virtual
      keypad.style.opacity = '1';
      keypad.style.pointerEvents = 'auto';
  }
  // --- FIN Funciones Habilitar/Deshabilitar ---

  // --- Lógica del Temporizador ---

  function stopQuestionTimer() {
      if (questionTimerInterval) {
          clearInterval(questionTimerInterval);
          questionTimerInterval = null;
          // console.log("Timer stopped.");
      }
  }

  function pauseQuestionTimer() {
      timerWasPaused = true;
      stopQuestionTimer();
      disableInput(); // Deshabilitar input al pausar por modal
      console.log("Timer explicitly paused by user action (modal). Input disabled.");
  }

  function resumeQuestionTimer() {
      // Solo reanudar si estaba pausado por el modal y estamos en juego
      if (timerWasPaused && currentGameState === STATE_PLAYING) {
          timerWasPaused = false; // Ya no está pausado
          if (remainingTime > 0) {
               startQuestionTimer(false); // false = no resetear tiempo
               enableInput(); // Habilitar input al reanudar
               console.log("Timer explicitly resumed from user pause. Input enabled.");
               // Considera si quieres poner foco aquí también
               // answerInput.focus();
          } else {
               // Si el tiempo se acabó mientras estaba pausado, manejarlo ahora
               console.log("Timer not resumed (time was already up when resuming).");
               handleTimeUp(); // handleTimeUp se encargará de deshabilitar input
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
       return TIME_PER_STREAK[0].time; // Default time
  }


  function startQuestionTimer(resetTime = true) {
      stopQuestionTimer(); // Asegurar limpieza

      if (resetTime) {
           currentQuestionTime = getTimeForCurrentStreak();
           remainingTime = currentQuestionTime;
      } else {
           if (remainingTime < 0) remainingTime = 0; // Salvaguarda
      }

      const initialPercentage = Math.max(0, (remainingTime / currentQuestionTime) * 100);
      timerBar.style.width = `${initialPercentage}%`;

      if (remainingTime > 0) {
           questionTimerInterval = setInterval(timerCountdown, TIMER_INTERVAL_MS);
      } else {
           handleTimeUp(); // Si tiempo es 0, ir a time up
      }
  }


  // --- Lógica del Juego ---

  function handleTimeUp() {
      // Prevenir múltiples llamadas y ejecución si no estamos jugando
      if (currentGameState !== STATE_PLAYING || feedbackLabel.classList.contains('timeup')) return;

      console.log("Time's up!");
      stopQuestionTimer();
      timerWasPaused = false; // Resetear estado de pausa
      disableInput(); // Deshabilitar input al mostrar feedback de tiempo

      feedbackLabel.textContent = `¡Tiempo! Era ${correctAnswer}`;
      feedbackLabel.className = 'feedback-label timeup';
      answerInput.className = 'incorrect'; // Marcar input como incorrecto

      consecutiveCorrect = 0;
      updateScoreLabels();
      timerBar.style.width = '0%';

      // Programar la siguiente pregunta
      if (feedbackTimeout) clearTimeout(feedbackTimeout);
      feedbackTimeout = setTimeout(() => {
          feedbackTimeout = null;
          if (currentGameState === STATE_PLAYING) {
               generateNewProblem(); // generateNewProblem habilitará el input
          }
      }, FEEDBACK_DELAY_MS);
  }


  function generateNewProblem() {
      if (currentGameState !== STATE_PLAYING) return;

      const level = levelDetails[currentLevel];
      num1 = randomInRange(level.range1[0], level.range1[1]);
      num2 = randomInRange(level.range2[0], level.range2[1]);
      correctAnswer = num1 * num2;

      problemLabel.textContent = `${num1} x ${num2} = ?`;
      answerInput.value = "";   // Limpiar campo visible para nueva respuesta
      resetFeedbackAndStyle();  // Limpiar feedback visual anterior

      // Habilitar input para la nueva pregunta
      enableInput();
      answerInput.focus(); // Poner foco en el input

      // Iniciar timer solo si no está pausado por modal
      if (!timerWasPaused) {
           startQuestionTimer(true);
      } else {
           // Actualizar barra visualmente si está pausado
           const percentage = Math.max(0, (remainingTime / currentQuestionTime) * 100);
           timerBar.style.width = `${percentage}%`;
           console.log("generateNewProblem: Timer remains paused (modal likely open). Input enabled.");
      }
      updateScoreLabels();
  }

  function checkAnswer() {
      // Obtener respuesta directamente del input field
      const userAnswerString = answerInput.value.trim();

      // Validaciones y guardias
      // No procesar si hay feedback mostrándose o si el tiempo ya se agotó
      if (feedbackTimeout || remainingTime <= 0) {
          // console.log(`Check answer ignored: feedback=${!!feedbackTimeout}, time=${remainingTime}`);
          return;
      }

      stopQuestionTimer();
      timerWasPaused = false; // Una respuesta normal limpia el estado de pausa
      disableInput(); // Deshabilitar input mientras se muestra feedback

      // Validar si la entrada está vacía
      if (userAnswerString === "") {
          feedbackLabel.textContent = "¡Ingrese respuesta!";
          feedbackLabel.className = 'feedback-label info';
          startQuestionTimer(false); // Reanudar timer con tiempo restante
          enableInput(); // Habilitar input de nuevo
          answerInput.focus(); // Poner foco
          return;
      }

      const userAnswer = parseInt(userAnswerString, 10);

      // Validar si es un número válido después de parseInt
       if (isNaN(userAnswer)) {
           feedbackLabel.textContent = "¡Ingrese solo números!";
           feedbackLabel.className = 'feedback-label info';
           startQuestionTimer(false); // Reanudar timer con tiempo restante
           enableInput(); // Habilitar input de nuevo
           answerInput.value = ''; // Limpiar input inválido
           answerInput.focus(); // Poner foco
           return;
       }

      // Comparar respuesta
      let isCorrect = userAnswer === correctAnswer;

      if (isCorrect) {
          feedbackLabel.textContent = "¡Correcto!";
          feedbackLabel.className = 'feedback-label correct';
          answerInput.className = 'correct'; // Marcar input como correcto
          consecutiveCorrect++;
          // Comprobar y guardar récord
          if (consecutiveCorrect > highScores[currentLevel]) {
              highScores[currentLevel] = consecutiveCorrect;
              saveLevelHighScore(currentLevel);
          }
      } else {
          feedbackLabel.textContent = `Incorrecto. Era ${correctAnswer}`;
          feedbackLabel.className = 'feedback-label incorrect';
          answerInput.className = 'incorrect'; // Marcar input como incorrecto
          consecutiveCorrect = 0;
      }

      updateScoreLabels();
      // No limpiar answerInput.value aquí, el usuario ve lo que puso.
      // Se limpiará en generateNewProblem.

      // Programar siguiente pregunta
      if (feedbackTimeout) clearTimeout(feedbackTimeout);
      feedbackTimeout = setTimeout(() => {
          feedbackTimeout = null; // Limpiar referencia
          if (currentGameState === STATE_PLAYING) {
              generateNewProblem(); // generateNewProblem habilitará el input
          }
      }, FEEDBACK_DELAY_MS);
  }


  // --- Manejadores de Eventos ---

  // Event Delegation para el Keypad Virtual
  keypad.addEventListener('click', (e) => {
      // Solo procesar si el target es un botón y el input no está deshabilitado
      if (e.target.tagName !== 'BUTTON' || answerInput.disabled) return;

      const key = e.target.dataset.key;

      // Limpiar feedback visual si se tocan números o borrar
      if (key !== 'OK') {
          resetFeedbackAndStyle();
      }

      // Modificar el valor del input directamente
      if (key >= '0' && key <= '9') {
          if (answerInput.value.length < MAX_ANSWER_LENGTH) {
              answerInput.value += key;
          }
      } else if (key === 'BKSP') {
          answerInput.value = answerInput.value.slice(0, -1);
      } else if (key === 'OK') {
          checkAnswer();
      }
      // Poner foco de nuevo en el input después de usar el keypad virtual
      answerInput.focus();
  });

  // Listener para input directo en el campo
  answerInput.addEventListener('input', () => {
      // Si el input está deshabilitado, ignorar
      if (answerInput.disabled) {
          // Forzar a que no cambie el valor si está deshabilitado (extra seguridad)
          answerInput.value = answerInput.value.slice(0, -1); // Elimina el último carácter tecleado
          return;
      }

      // Limpiar feedback si el usuario empieza a escribir/corregir
      resetFeedbackAndStyle();

      // Limitar longitud
      if (answerInput.value.length > MAX_ANSWER_LENGTH) {
          answerInput.value = answerInput.value.slice(0, MAX_ANSWER_LENGTH);
      }
      // Podrías añadir validación de solo números aquí si type="number" no es suficiente
      // answerInput.value = answerInput.value.replace(/[^0-9]/g, '');
  });

  // Listener para la tecla Enter en el campo
  answerInput.addEventListener('keydown', (event) => {
      // Ignorar si el input está deshabilitado o si no estamos jugando
       if (answerInput.disabled || currentGameState !== STATE_PLAYING) return;

      if (event.key === 'Enter') {
          event.preventDefault(); // Prevenir comportamiento por defecto
          checkAnswer(); // Ejecutar la misma lógica que el botón OK
      }
  });


  // Listeners para botones de control (Startup, Opciones, Modal)
  startButton.addEventListener('click', () => {
      currentGameState = STATE_LEVEL_SELECT;
      populateLevelButtons(levelButtonsContainer, handleInitialLevelSelect);
      showScreen(levelSelectScreen);
  });

  optionsButton.addEventListener('click', () => {
       if (currentGameState !== STATE_PLAYING) return;
       pauseQuestionTimer(); // Pausa y deshabilita input
       levelModal.style.display = 'block';
  });

  closeModalButton.addEventListener('click', () => {
      levelModal.style.display = 'none';
      resumeQuestionTimer(); // Reanuda y habilita input si procede
  });

  window.addEventListener('click', (event) => {
      // Cerrar modal si se clica fuera
      if (event.target == levelModal) {
          levelModal.style.display = 'none';
          resumeQuestionTimer(); // Reanuda y habilita input si procede
      }
  });

  // --- Funciones de Configuración de UI ---

  function handleInitialLevelSelect(levelIndex) {
      currentLevel = levelIndex;
      currentGameState = STATE_PLAYING;
      consecutiveCorrect = 0;
      timerWasPaused = false;
      // Asegurarse que los récords estén cargados
      if (!highScores || highScores.length !== NUM_LEVELS) loadHighScores();
      populateLevelButtons(modalLevelButtonsContainer, handleModalLevelSelect); // Pre-llenar modal
      showScreen(gameScreen);
      generateNewProblem(); // Iniciar juego (habilita input y foco)
  }

  function handleModalLevelSelect(levelIndex) {
       levelModal.style.display = 'none'; // Cerrar modal primero

       if (levelIndex !== currentLevel) {
           currentLevel = levelIndex;
           consecutiveCorrect = 0;
           timerWasPaused = false; // Resetear pausa para nuevo nivel
           generateNewProblem(); // Generar problema (habilita input y foco)
       } else {
           // Mismo nivel, solo reanudar
           resumeQuestionTimer(); // Habilita input si procede
       }
  }

  // Crear botones de nivel
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
      loadHighScores(); // Cargar récords primero
      currentGameState = STATE_STARTUP;
      // Inicialmente, el input debería estar deshabilitado hasta que empiece el juego
      disableInput();
      showScreen(startupScreen); // Mostrar pantalla inicial
  }

  init(); // Ejecutar inicialización

}); // Fin del DOMContentLoaded