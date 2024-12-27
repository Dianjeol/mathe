import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, Animated, FlatList, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { askLLM } from 'app-apis';

// Theme configuration
const theme = {
  colors: {
    primary: '#4CAF50',
    secondary: '#2196F3',
    danger: '#ff4444',
    background: '#f0f0f0',
    text: '#333',
    lightText: '#666',
    white: '#ffffff',
    timer: '#76c7c0',
    timerBg: '#e0e0e0',
    success: '#43a047',
    successLight: '#e8f5e9',
    disabled: '#cccccc',
  },
  spacing: {
    xs: 5,
    small: 10,
    medium: 15,
    large: 20,
    xl: 30,
  },
  fontSize: {
    small: 14,
    medium: 18,
    large: 24,
    xl: 32,
  },
  borderRadius: {
    small: 5,
    medium: 8,
    large: 10,
    xl: 20,
  },
};

// Timer helper functions
const timerHelpers = {
  resetTimer: (timerRef, progressAnim, duration, callback) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    progressAnim.stopAnimation(() => {
      progressAnim.setValue(1);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: duration * 1000,
        useNativeDriver: false,
      }).start();
      if (callback) callback();
    });
  },

  startNewTimer: (timerRef, progressAnim, duration, onTick, onComplete) => {
    const startTime = Date.now();
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: duration * 1000,
      useNativeDriver: false,
    }).start();

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);

      if (onTick) onTick(remaining);

      if (remaining <= 0.1) {
        clearInterval(timerRef.current);
        if (onComplete) onComplete();
      }
    }, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }
};

// Game Configuration
const GameConfig = {
  TOTAL_LEVELS: 30,
  QUESTIONS_PER_LEVEL: 5,
  TIME_PER_QUESTION: 15,
  WRONG_ANSWER_PENALTY: 5,
  QUICK_ANSWER_TIME: 1.5,
  QUICK_ANSWER_POINTS: 25,
  NORMAL_POINTS: 10,
};

// Leaderboard Configuration
const LeaderboardConfig = {
  API_URL: 'https://dnrrdfapxzqpfabjxcji.supabase.co/rest/v1/highscores',
  API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucnJkZmFweHpxcGZhYmp4Y2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ5NjMwODksImV4cCI6MjA1MDUzOTA4OX0.mzVEpUpoAH2JzKBEXRgQ_ParxBju9f97qRlQv4uR8aM',
  // Note: In a production environment, this API key should be stored in environment variables
  // API_KEY: process.env.SUPABASE_API_KEY
};

// Question Generator Utilities
const QuestionGeneratorUtils = {
  generateSquareQuestion: (level, usedQuestions, selectedLanguage) => {
    const numbers = level === 1 ? [5, 6, 7, 8, 9] : Array.from({ length: 7 }, (_, i) => i + 6);
    const availableNumbers = numbers.filter(n => !usedQuestions.includes(`${n}² = ?`));

    if (availableNumbers.length === 0) return null;

    const number = availableNumbers[0];
    const question = `${number}² = ?`;

    return {
      question,
      answer: number * number,
      type: 'square'
    };
  },

  generateMultiplicationQuestion: (level, usedQuestions) => {
    const multiplier = level + 1;
    const numbers = [3, 4, 6, 7, 8, 9];
    let number;
    let question;

    do {
      number = numbers[Math.floor(Math.random() * numbers.length)];
      question = `${multiplier} × ${number} = ?`;
    } while (usedQuestions.includes(question));

    return {
      question,
      answer: multiplier * number,
      type: 'multiplication'
    };
  },

  generateDivisionQuestion: (level) => {
    const divisor = level - 9;
    const numbers = [3, 4, 6, 7, 8, 9];
    const result = numbers[Math.floor(Math.random() * numbers.length)];
    const dividend = divisor * result;

    return {
      question: `${dividend} ÷ ${divisor} = ?`,
      answer: result,
      type: 'division'
    };
  },

  generateFractionQuestion: (level, usedQuestions, selectedLanguage) => {
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    let numerator, denominator, multiplier, question;

    do {
      denominator = Math.floor(Math.random() * 8) + 2;
      numerator = Math.floor(Math.random() * (denominator - 1)) + 1;

      const divisor = gcd(numerator, denominator);
      if (divisor === 1) continue;

      numerator = numerator / divisor;
      denominator = denominator / divisor;
      question = `${numerator}/${denominator}`;
    } while (usedQuestions.includes(question));

    multiplier = Math.floor(Math.random() * (level - 21)) + 2;
    const originalNumerator = numerator * multiplier;
    const originalDenominator = denominator * multiplier;

    return {
      question: `${translations.fullyReduce[selectedLanguage]}: ${originalNumerator}/${originalDenominator}`,
      answer: `${numerator}/${denominator}`,
      type: 'fraction'
    };
  }
};

// Translations for multilingual support
const translations = {
  startGame: {
    en: 'Start Game',
    de: 'Spiel starten',
    ar: 'ابدأ اللعبة',
    dr: 'آغاز بازی',
    es: 'Iniciar Juego',
    fa: 'شروع بازی',
    fr: 'Commencer le Jeu',
    ku: 'Destpêka lîstikê',
    ka: 'თამაშის დაწყება',
    so: 'Bilow Ciyaarta',
    ti: 'ጸወታ ጀምር',
    tr: 'Oyunu Başlat',
    uk: 'Почати гру'
  },
  leaderboard: {
    en: 'Leaderboard',
    de: 'Bestenliste',
    ar: 'لوحة المتصدرين',
    dr: 'جدول امتیازات',
    es: 'Tabla de Clasificación',
    fa: 'جدول امتیازات',
    fr: 'Classement',
    ku: 'Tabloya pêşeng',
    ka: 'ლიდერების დაფა',
    so: 'Hogaamiyeyaasha',
    ti: 'ናይ መሪሕነት ሰሌዳ',
    tr: 'Skor Tablosu',
    uk: 'Таблиця лідерів'
  },
  fullyReduce: {
    en: 'Fully Reduce',
    de: 'Kürze vollständig',
    ar: 'اختزل بالكامل',
    dr: 'به طور کامل ساده کنید',
    es: 'Reducir completamente',
    fa: 'کاملاً ساده کنید',
    fr: 'Réduire complètement',
    ku: 'Bi tevahî bikar bîne',
    ka: 'სრულად შემცირება',
    so: 'Si buuxda u yaree',
    ti: 'ብሙሉእ ንነካካ',
    tr: 'Tamamen Sadeleştir',
    uk: 'Повністю скоротіть'
  },
  mathChallenge: {
    en: 'Math Challenge',
    de: 'Mathe Challenge',
    ar: 'تحدي الرياضيات',
    dr: 'چالش ریاضی',
    es: 'Desafío Matemático',
    fa: 'چالش ریاضی',
    fr: 'Défi Mathématique',
    ku: 'Çelengê matematîkê',
    ka: 'მათემატიკური გამოწვევა',
    so: 'Tartanka Xisaabta',
    ti: 'ናይ ሒሳብ ፈተና',
    tr: 'Matematik Mücadelesi',
    uk: 'Математичний виклик'
  },
  score: {
    en: 'Score',
    de: 'Punkte',
    ar: 'النتيجة',
    dr: 'امتیاز',
    es: 'Puntuación',
    fa: 'امتیاز',
    fr: 'Score',
    ku: 'Skor',
    ka: 'ქულა',
    so: 'Dhibcaha',
    ti: 'ውጽኢት',
    tr: 'Puan',
    uk: 'Рахунок'
  },
  level: {
    en: 'Level',
    de: 'Level',
    ar: 'المستوى',
    dr: 'سطح',
    es: 'Nivel',
    fa: 'سطح',
    fr: 'Niveau',
    ku: 'Ast',
    ka: 'დონე',
    so: 'Heerka',
    ti: 'ደረጃ',
    tr: 'Seviye',
    uk: 'Рівень'
  },
  gameOver: {
    en: 'Game Over',
    de: 'Spiel vorbei',
    ar: 'انتهت اللعبة',
    dr: 'بازی تمام شد',
    es: 'Juego Terminado',
    fa: 'بازی تمام شد',
    fr: 'Partie Terminée',
    ku: 'Lîstik qediya',
    ka: 'თამაში დასრულებულია',
    so: 'Ciyaarta waa dhammaatay',
    ti: 'ጸወታ ተወዲኡ',
    tr: 'Oyun Bitti',
    uk: 'Гра закінчена'
  },
  finalScore: {
    en: 'Final Score',
    de: 'Endpunktzahl',
    ar: 'النتيجة النهائية',
    dr: 'امتیاز نهایی',
    es: 'Puntuación Final',
    fa: 'امتیاز نهایی',
    fr: 'Score Final',
    ku: 'Skora dawî',
    ka: 'საბოლოო ქულა',
    so: 'Dhibcaha ugu dambeeya',
    ti: 'መወዳእታ ውጽኢት',
    tr: 'Final Puanı',
    uk: 'Фінальний рахунок'
  },
  highScore: {
    en: 'High Score',
    de: 'Höchstpunktzahl',
    ar: 'أعلى نتيجة',
    dr: 'بالاترین امتیاز',
    es: 'Puntuación Máxima',
    fa: 'بالاترین امتیاز',
    fr: 'Meilleur Score',
    ku: 'Skora bilind',
    ka: 'რეკორდი',
    so: 'Dhibcaha ugu sarreeya',
    ti: 'ልዑል ውጽኢት',
    tr: 'En Yüksek Puan',
    uk: 'Рекорд'
  },
  playAgain: {
    en: 'Play Again',
    de: 'Nochmal spielen',
    ar: 'العب مرة أخرى',
    dr: 'دوباره بازی کنید',
    es: 'Jugar de Nuevo',
    fa: 'بازی مجدد',
    fr: 'Rejouer',
    ku: 'Dîsa bilîze',
    ka: 'თავიდან თამაში',
    so: 'Ciyaar mar kale',
    ti: 'ከምብሓድሽ ጻወት',
    tr: 'Tekrar Oyna',
    uk: 'Грати знову'
  },
  viewLeaderboard: {
    en: 'View Leaderboard',
    de: 'Bestenliste ansehen',
    ar: 'عرض لوحة المتصدرين',
    dr: 'مشاهده جدول امتیازات',
    es: 'Ver Tabla de Clasificación',
    fa: 'مشاهده جدول امتیازات',
    fr: 'Voir le Classement',
    ku: 'Tabloya pêşeng bibîne',
    ka: 'ლიდერების დაფის ნახვა',
    so: 'Arag Hogaamiyeyaasha',
    ti: 'ናይ መሪሕነት ሰሌዳ ርአ',
    tr: 'Skor Tablosunu Görüntüle',
    uk: 'Показати таблицю лідерів'
  },
  congratulations: {
    en: 'Congratulations!',
    de: 'Glückwunsch!',
    ar: 'تهانينا!',
    dr: 'تبریک!',
    es: '¡Felicitaciones!',
    fa: 'تبریک!',
    fr: 'Félicitations!',
    ku: 'Pîroz be!',
    ka: 'გილოცავთ!',
    so: 'Hambalyo!',
    ti: 'እንቋዕ ሓጎሰካ!',
    tr: 'Tebrikler!',
    uk: 'Вітаємо!'
  },
  backToGame: {
    en: 'Back to Game',
    de: 'Zurück zum Spiel',
    ar: 'العودة إلى اللعبة',
    dr: 'برگشت به بازی',
    es: 'Volver al Juego',
    fa: 'برگشت به بازی',
    fr: 'Retour au Jeu',
    ku: 'Vegere lîstikê',
    ka: 'თამაშში დაბრუნება',
    so: 'Ku noqo Ciyaarta',
    ti: 'ናብ ጸወታ ተመለስ',
    tr: 'Oyuna Dön',
    uk: 'Повернутися до гри'
  },
  enterUsername: {
    en: 'Enter Username',
    de: 'Benutzernamen eingeben',
    ar: 'أدخل اسم المستخدم',
    dr: 'نام کاربری را وارد کنید',
    es: 'Ingrese su nombre de usuario',
    fa: 'نام کاربری را وارد کنید',
    fr: 'Entrez votre nom d\'utilisateur',
    ku: 'Navê bikarhêner binivîse',
    ka: 'შეიყვანეთ მომხმარებლის სახელი',
    so: 'Gali magacaaga isticmaale',
    ti: 'ሽም ተጠቃሚ ኣእቱ',
    tr: 'Kullanıcı Adınızı Girin',
    uk: 'Введіть ім'я користувача'
  },
  yourUsername: {
    en: 'Your Username',
    de: 'Dein Benutzername',
    ar: 'اسم المستخدم الخاص بك',
    dr: 'نام کاربری شما',
    es: 'Tu nombre de usuario',
    fa: 'نام کاربری شما',
    fr: 'Votre nom d\'utilisateur',
    ku: 'Navê te yê bikarhêner',
    ka: 'თქვენი მომხმარებლის სახელი',
    so: 'Magacaaga isticmaale',
    ti: 'ናይ መውረድታ ሽምካ',
    tr: 'Kullanıcı Adınız',
    uk: 'Ваше ім'я користувача'
  }
};

// Question Generator
const QuestionGenerator = {
  ...QuestionGeneratorUtils,
  generateQuestion: (level, usedQuestions = [], selectedLanguage) => {
    if (level === 1) {
      const numbers = [5, 6, 7, 8, 9]; // Fixed sequence of numbers
      const availableNumbers = numbers.filter(n => !usedQuestions.includes(`${n}² = ?`));

      if (availableNumbers.length === 0) {
        return null; // No more questions available
      }

      const number = availableNumbers[0]; // Next number in sequence
      const question = `${number}² = ?`;

      return {
        question,
        answer: number * number,
        type: 'square'
      };
    } else if (level >= 2 && level <= 10) {
      // Multiplication tables 2x to 10x, using 3, 4, 6, 7, 8, 9 randomly
      const multiplier = level + 1;
      const numbers = [3, 4, 6, 7, 8, 9];
      let question;
      let number;

      do {
        number = numbers[Math.floor(Math.random() * numbers.length)];
        question = `${multiplier} × ${number} = ?`;
      } while (usedQuestions.includes(question));

      return {
        question,
        answer: multiplier * number,
        type: 'multiplication'
      };
    } else if (level >= 11 && level <= 20) {
      // Division tables 2x to 10x, using 3, 4, 6, 7, 8, 9 randomly
      const divisor = level - 9; // Division table based on level
      const numbers = [3, 4, 6, 7, 8, 9];
      const result = numbers[Math.floor(Math.random() * numbers.length)];
      const dividend = divisor * result;
      return {
        question: `${dividend} ÷ ${divisor} = ?`,
        answer: result,
        type: 'division'
      };
    } else if (level === 21) {
      let number;
      let question;
      do {
        number = Math.floor(Math.random() * 7) + 6; // Numbers between 6 and 12
        if (number === 10) continue; // Skip 10
        question = `${number}² = ?`;
      } while (usedQuestions.includes(question));

      return {
        question,
        answer: number * number,
        type: 'square'
      };
    } else if (level >= 22 && level <= 30) {
      const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
      let numerator, denominator, multiplier, question;

      do {
        denominator = Math.floor(Math.random() * 8) + 2; // 2 to 9
        numerator = Math.floor(Math.random() * (denominator - 1)) + 1; // 1 to denominator-1

        // Ensure we don't get already reduced fractions
        const divisor = gcd(numerator, denominator);
        if (divisor === 1) continue;

        // Reduce the fraction
        numerator = numerator / divisor;
        denominator = denominator / divisor;
        question = `${numerator}/${denominator}`;
      } while (usedQuestions.includes(question));

      multiplier = Math.floor(Math.random() * (level - 21)) + 2; // Multiplier based on level
      const originalNumerator = numerator * multiplier;
      const originalDenominator = denominator * multiplier;

      return {
        question: `${translations.fullyReduce[selectedLanguage]}: ${originalNumerator}/${originalDenominator}`,
        answer: `${numerator}/${denominator}`,
        type: 'fraction'
      };
    }
  },

  generateAnswerOptions: (correctAnswer) => {
    if (typeof correctAnswer === 'string' && correctAnswer.includes('/')) {
      // Handle fraction answers
      const [num, den] = correctAnswer.split('/').map(Number);
      const options = [correctAnswer];

      while (options.length < 4) {
        const offsetNum = Math.floor(Math.random() * 5) - 2;
        const offsetDen = Math.floor(Math.random() * 5) - 2;
        const newOption = `${Math.max(1, num + offsetNum)}/${Math.max(2, den + offsetDen)}`;
        if (!options.includes(newOption)) {
          options.push(newOption);
        }
      }
      return options.sort(() => Math.random() - 0.5);
    }

    // Handle numeric answers
    const options = [correctAnswer];
    while (options.length < 4) {
      const offset = Math.floor(Math.random() * 10) - 5;
      const newOption = correctAnswer + offset;
      if (!options.includes(newOption) && newOption > 0) {
        options.push(newOption);
      }
    }
    return options.sort(() => Math.random() - 0.5);
  }
};

// Leaderboard Service
const LeaderboardService = {
  fetchLeaderboard: async () => {
    try {
      const response = await axios.get(`${LeaderboardConfig.API_URL}?select=username,score&order=score.desc`, {
        headers: { 'apikey': LeaderboardConfig.API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      throw error;
    }
  },

  submitScore: async (username, score) => {
    try {
      console.log('Submitting score:', { username, score }); // Debug log
      const response = await axios.post(LeaderboardConfig.API_URL,
        { username: username.trim(), score },
        {
          headers: {
            'apikey': LeaderboardConfig.API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Score successfully sent:', response.data); // Debug log
    } catch (error) {
      console.error('Error sending score:', error.response?.data || error.message); // Enhanced error message
      throw error;
    }
  }
};

// Game Screen Component
const GameScreen = ({ onGameOver, level, score, selectedLanguage }) => {
  const {
    TIME_PER_QUESTION,
    QUESTIONS_PER_LEVEL,
    WRONG_ANSWER_PENALTY,
    QUICK_ANSWER_TIME,
    QUICK_ANSWER_POINTS,
    NORMAL_POINTS,
    TOTAL_LEVELS
  } = GameConfig;

  const savedTotalTime = useRef(0);
  const [totalGameTime, setTotalGameTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerOptions, setAnswerOptions] = useState([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [currentScore, setCurrentScore] = useState(score);
  const questionStartTime = useRef(Date.now());
  const timerRef = useRef(null);
  const gameStartTime = useRef(null);
  const totalGameTimeRef = useRef(null);

  const [questions, setQuestions] = useState([]);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Initialize game start time and restore saved time when level changes
    if (!gameStartTime.current) {
      gameStartTime.current = Date.now() - (savedTotalTime.current * 1000);
      totalGameTimeRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameStartTime.current) / 1000);
        setTotalGameTime(elapsed);
        savedTotalTime.current = elapsed;
      }, 1000);
    }

    // Cleanup function for component unmount only
    return () => {
      if (totalGameTimeRef.current) {
        clearInterval(totalGameTimeRef.current);
      }
    };
  }, [level]); // Run when level changes

  useEffect(() => {
    const generateQuestionsForLevel = () => {
      const questions = [];
      const usedQuestions = new Set();

      for (let i = 0; i < QUESTIONS_PER_LEVEL; i++) {
        const question = QuestionGenerator.generateQuestion(level, Array.from(usedQuestions), selectedLanguage);
        usedQuestions.add(question.question);
        questions.push(question);
      }
      return questions;
    };

    // Generate new questions without affecting timer
    const newQuestions = generateQuestionsForLevel();
    const firstQuestion = newQuestions[0];
    const firstAnswerOptions = QuestionGenerator.generateAnswerOptions(firstQuestion.answer);

    // Update state without resetting game timer
    setQuestions(newQuestions);
    setQuestionCount(0);
    setCurrentQuestion(firstQuestion);
    setAnswerOptions(firstAnswerOptions);
  }, [level, selectedLanguage]); // Dependencies for level changes and language updates

  useEffect(() => {
    if (questionCount === 0) {
      console.log('Starting new timer with duration:', TIME_PER_QUESTION);

      return timerHelpers.startNewTimer(
        timerRef,
        progressAnim,
        TIME_PER_QUESTION,
        (remaining) => {
          console.log('Timer update - Remaining:', remaining.toFixed(2));
          setTimeLeft(remaining);
        },
        () => {
          console.log('Game Over Triggered: Time reached 0');
          onGameOver(currentScore);
        }
      );
    }
  }, [TIME_PER_QUESTION, questionCount]);

  const handleAnswer = (selectedAnswer) => {
    if (!currentQuestion) return;

    const timeTaken = (Date.now() - questionStartTime.current) / 1000;
    const isCorrect = currentQuestion.type === 'fraction' ?
      selectedAnswer === currentQuestion.answer :
      Math.abs(selectedAnswer - currentQuestion.answer) < 0.001;

    // Save current time before any state changes
    savedTotalTime.current = totalGameTime;

    if (!isCorrect) {
      const newTimeLeft = Math.max(0, timeLeft - WRONG_ANSWER_PENALTY);
      setTimeLeft(newTimeLeft);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const startTime = Date.now();
      progressAnim.setValue(newTimeLeft / TIME_PER_QUESTION);

      const animation = Animated.timing(progressAnim, {
        toValue: 0,
        duration: newTimeLeft * 1000,
        useNativeDriver: false,
      });
      animation.start();

      if (newTimeLeft <= 0.1) {
        onGameOver(currentScore);
        return;
      }

      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, newTimeLeft - elapsed);
        setTimeLeft(remaining);

        if (remaining <= 0.1) {
          clearInterval(timerRef.current);
          animation.stop();
          onGameOver(currentScore);
        }
      }, 100);
      return;
    }

    // Calculate points for correct answer
    const points = timeTaken <= QUICK_ANSWER_TIME ? QUICK_ANSWER_POINTS : NORMAL_POINTS;
    const newScore = currentScore + points;
    setCurrentScore(newScore);

    // Handle level progression
    const nextQuestionCount = questionCount + 1;
    if (nextQuestionCount >= QUESTIONS_PER_LEVEL) {
      if (level === GameConfig.TOTAL_LEVELS && nextQuestionCount >= QUESTIONS_PER_LEVEL) {
        // Add bonus points for completing all levels and ensure we're at the last question
        const finalScore = newScore + 1000;
        setCurrentScore(finalScore);
        onGameOver(finalScore);
      } else {
        // Move to next level if not at final level
        setQuestionCount(0); // Reset question count for new level
        onGameOver(newScore, true);
      }
    } else {
      // Move to next question within current level
      setQuestionCount(nextQuestionCount);
      const nextQuestion = questions[nextQuestionCount];
      if (nextQuestion) {
        setCurrentQuestion(nextQuestion);
        setAnswerOptions(QuestionGenerator.generateAnswerOptions(nextQuestion.answer));
      }
    }

    // Reset timer and animation for next question
    clearInterval(timerRef.current);
    progressAnim.stopAnimation(() => {
      setTimeLeft(TIME_PER_QUESTION); // Reset time left
      progressAnim.setValue(1); // Reset progress bar to full
      questionStartTime.current = Date.now();

      Animated.timing(progressAnim, {
        toValue: 0,
        duration: TIME_PER_QUESTION * 1000,
        useNativeDriver: false,
      }).start();
    });
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.gameContainer}>
      <View style={styles.topBar}>
        <Text style={styles.scoreText}>{translations.score[selectedLanguage]}: {currentScore}</Text>
        <Text style={styles.levelText}>{translations.level[selectedLanguage]} {level}/{GameConfig.TOTAL_LEVELS}</Text>
      </View>
      <View style={styles.timerBarContainer}>
        <Animated.View
          style={[
            styles.timerBar,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%']
              })
            }
          ]}
        />
      </View>
      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>{currentQuestion?.question}</Text>
      </View>
      <View style={styles.answersContainer}>
        {answerOptions.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={styles.answerButton}
            onPress={() => handleAnswer(option)}
          >
            <Text style={styles.answerText}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.totalTimeContainer}>
        <Ionicons name="time-outline" size={20} color={theme.colors.lightText} />
        <Text style={styles.totalTimeText}>{formatTime(totalGameTime)}</Text>
      </View>
    </View>
  );
};

// Leaderboard Screen Component
const LeaderboardScreen = ({ onBack, currentScore, onUsernameChange, selectedLanguage = 'en' }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [username, setUsername] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameSubmitted, setUsernameSubmitted] = useState(false);
  const scrollViewRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    fetchAndSetLeaderboard();
    loadSavedUsername();
  }, []);

  useEffect(() => {
    // Scroll to the highlighted item when leaderboard or username changes
    if (scrollViewRef.current && username) {
      const index = leaderboard.findIndex((entry) => entry.username === username);
      if (index !== -1 && itemRefs.current[index]) {
        itemRefs.current[index].measureLayout(
          scrollViewRef.current,
          (x, y) => {
            scrollViewRef.current.scrollTo({ y: y, animated: true });
          },
          (error) => console.error('Error measuring layout:', error)
        );
      }
    }
  }, [leaderboard, username]);

  const loadSavedUsername = async () => {
    try {
      const savedUsername = await AsyncStorage.getItem('username');
      if (savedUsername) {
        setUsername(savedUsername);
        setUsernameInput(savedUsername);
      }
    } catch (error) {
      console.error('Error loading username:', error);
