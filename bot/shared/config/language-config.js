/**
 * Language Configuration for Multi-lingual Support
 * Centralized configuration for all language-specific settings
 *
 * This configuration supports:
 * - Reflective question generation in multiple languages
 * - Language-specific prompts and examples
 * - Cultural adaptations for different regions
 * - Easy addition of new languages
 */

const LANGUAGE_CONFIG = {
  // English
  en: {
    code: 'en',
    name: 'English',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'You are an expert master teacher conducting a post-observation reflective conversation.',
      languageInstruction: 'Generate the question in ENGLISH language.',
      examples: {
        question1: {
          focus: "Start with teacher's perspective on a SPECIFIC moment",
          example: "I noticed when you asked about [specific question from transcript], students responded with [specific response]. What were you hoping to achieve in that moment?"
        },
        question2: {
          focus: "Dig into a SPECIFIC pedagogical decision",
          example: "At around the [X]-minute mark, when [specific thing happened], you chose to [specific action]. Walk me through your thinking there."
        },
        question3: {
          focus: "Look forward based on SPECIFIC observation",
          example: "You mentioned [their previous answer]. Thinking about how [specific moment from transcript] went, what might you try differently next time?"
        }
      },
      culturalContext: "Use examples relevant to the teacher's local classroom context",
      codeSwitch: false
    }
  },

  // Urdu
  ur: {
    code: 'ur',
    name: 'اردو',
    direction: 'rtl',
    reflectiveQuestions: {
      systemPrompt: 'آپ ایک ماہر پاکستانی ماسٹر ٹیچر ہیں جو کلاس کے مشاہدے کے بعد بات چیت کر رہے ہیں۔',
      languageInstruction: 'سوال اردو زبان میں تیار کریں۔ تکنیکی اصطلاحات کے لیے انگریزی استعمال کریں اگر ضروری ہو۔',
      examples: {
        question1: {
          focus: "استاد کے نقطہ نظر سے شروع کریں",
          example: "میں نے دیکھا جب آپ نے [مخصوص سوال] کے بارے میں پوچھا، طلباء نے [مخصوص جواب] دیا۔ اس لمحے میں آپ کیا حاصل کرنا چاہتے تھے؟"
        },
        question2: {
          focus: "تدریسی فیصلے کی تفصیل",
          example: "تقریباً [X] منٹ پر، جب [مخصوص واقعہ] ہوا، آپ نے [مخصوص عمل] کا انتخاب کیا۔ اس کے پیچھے آپ کی سوچ کیا تھی؟"
        },
        question3: {
          focus: "مستقبل کی منصوبہ بندی",
          example: "آپ نے [پچھلا جواب] کہا تھا۔ [مخصوص لمحہ] کو دیکھتے ہوئے، اگلی بار آپ کیا مختلف کریں گے؟"
        }
      },
      culturalContext: 'پاکستانی کلاس روم کے تناظر میں مثالیں استعمال کریں',
      codeSwitch: true // Allow natural code-switching between Urdu and English
    }
  },

  // Arabic
  ar: {
    code: 'ar',
    name: 'العربية',
    direction: 'rtl',
    reflectiveQuestions: {
      systemPrompt: 'أنت معلم خبير يجري محادثة تأملية بعد ملاحظة الفصل.',
      languageInstruction: 'قم بإنشاء السؤال باللغة العربية.',
      examples: {
        question1: {
          focus: "ابدأ بمنظور المعلم",
          example: "لاحظت عندما سألت عن [سؤال محدد]، أجاب الطلاب بـ [إجابة محددة]. ما الذي كنت تأمل تحقيقه في تلك اللحظة؟"
        },
        question2: {
          focus: "التعمق في قرار تربوي",
          example: "في حوالي الدقيقة [X]، عندما [حدث شيء محدد]، اخترت [إجراء محدد]. اشرح لي تفكيرك هناك."
        },
        question3: {
          focus: "التطلع إلى المستقبل",
          example: "لقد ذكرت [إجابتهم السابقة]. بالتفكير في كيفية سير [لحظة محددة]، ما الذي قد تجربه بشكل مختلف في المرة القادمة؟"
        }
      },
      culturalContext: 'استخدم أمثلة ذات صلة بسياق الفصل الدراسي في المنطقة العربية',
      codeSwitch: false
    }
  },

  // Spanish
  es: {
    code: 'es',
    name: 'Español',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'Eres un maestro experto realizando una conversación reflexiva post-observación.',
      languageInstruction: 'Genera la pregunta en idioma ESPAÑOL.',
      examples: {
        question1: {
          focus: "Comienza con la perspectiva del maestro",
          example: "Noté cuando preguntaste sobre [pregunta específica], los estudiantes respondieron con [respuesta específica]. ¿Qué esperabas lograr en ese momento?"
        },
        question2: {
          focus: "Profundiza en una decisión pedagógica",
          example: "Alrededor del minuto [X], cuando [algo específico sucedió], elegiste [acción específica]. Explícame tu razonamiento allí."
        },
        question3: {
          focus: "Mirar hacia adelante",
          example: "Mencionaste [su respuesta anterior]. Pensando en cómo fue [momento específico], ¿qué podrías intentar de manera diferente la próxima vez?"
        }
      },
      culturalContext: 'Usa ejemplos relevantes para el contexto del aula',
      codeSwitch: false
    }
  },

  // ─────────────────────────── INDIA MARKET ───────────────────────────

  // Hindi
  hi: {
    code: 'hi',
    name: 'हिन्दी',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'आप एक अनुभवी मास्टर टीचर हैं जो कक्षा अवलोकन के बाद एक चिंतनशील बातचीत कर रहे हैं।',
      languageInstruction: 'प्रश्न हिंदी में तैयार करें। ज़रूरत होने पर तकनीकी शब्दों के लिए अंग्रेज़ी का प्रयोग करें।',
      examples: {
        question1: {
          focus: 'शिक्षक के दृष्टिकोण से शुरू करें',
          example: 'मैंने देखा जब आपने [विशेष प्रश्न] पूछा, तो छात्रों ने [विशेष प्रतिक्रिया] दी। उस पल आप क्या हासिल करना चाहते थे?'
        },
        question2: {
          focus: 'किसी शिक्षण-निर्णय में गहराई से जाएँ',
          example: 'लगभग [X] मिनट पर, जब [विशेष घटना] हुई, आपने [विशेष कदम] चुना। ज़रा अपनी सोच बताइए।'
        },
        question3: {
          focus: 'आगे की योजना',
          example: 'आपने [पिछला उत्तर] कहा था। [विशेष पल] को देखते हुए, अगली बार आप क्या अलग करेंगे?'
        }
      },
      culturalContext: 'भारतीय कक्षा के संदर्भ में उदाहरण दें',
      codeSwitch: true
    }
  },

  // Bengali
  bn: {
    code: 'bn',
    name: 'বাংলা',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'আপনি একজন অভিজ্ঞ মাস্টার শিক্ষক, শ্রেণি পর্যবেক্ষণের পরে একটি প্রতিফলনমূলক আলোচনা করছেন।',
      languageInstruction: 'প্রশ্নটি বাংলায় তৈরি করুন। প্রয়োজনে প্রযুক্তিগত শব্দের জন্য ইংরেজি ব্যবহার করুন।',
      examples: {
        question1: {
          focus: 'শিক্ষকের দৃষ্টিভঙ্গি দিয়ে শুরু করুন',
          example: 'আমি লক্ষ্য করেছি যখন আপনি [নির্দিষ্ট প্রশ্ন] করলেন, শিক্ষার্থীরা [নির্দিষ্ট প্রতিক্রিয়া] দিল। ওই মুহূর্তে আপনি কী অর্জন করতে চেয়েছিলেন?'
        },
        question2: {
          focus: 'একটি শিক্ষণ-সিদ্ধান্তে গভীরে যান',
          example: 'প্রায় [X] মিনিটে, যখন [নির্দিষ্ট ঘটনা] ঘটল, আপনি [নির্দিষ্ট পদক্ষেপ] বেছে নিলেন। আপনার ভাবনাটা একটু বলুন।'
        },
        question3: {
          focus: 'সামনের পরিকল্পনা',
          example: 'আপনি [আগের উত্তর] বলেছিলেন। [নির্দিষ্ট মুহূর্ত] কেমন হলো ভেবে, পরের বার কী আলাদাভাবে করবেন?'
        }
      },
      culturalContext: 'ভারতীয় শ্রেণিকক্ষের প্রেক্ষাপটে উদাহরণ দিন',
      codeSwitch: true
    }
  },

  // Marathi
  mr: {
    code: 'mr',
    name: 'मराठी',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'तुम्ही एक अनुभवी मास्टर शिक्षक आहात, वर्ग निरीक्षणानंतर चिंतनशील संवाद करत आहात.',
      languageInstruction: 'प्रश्न मराठीत तयार करा. गरज असल्यास तांत्रिक शब्दांसाठी इंग्रजी वापरा.',
      examples: {
        question1: {
          focus: 'शिक्षकाच्या दृष्टिकोनातून सुरुवात करा',
          example: 'मी पाहिलं की जेव्हा तुम्ही [विशिष्ट प्रश्न] विचारला, तेव्हा विद्यार्थ्यांनी [विशिष्ट प्रतिसाद] दिला. त्या क्षणी तुम्हाला काय साध्य करायचं होतं?'
        },
        question2: {
          focus: 'एखाद्या शिक्षण-निर्णयात खोलात जा',
          example: 'साधारण [X] मिनिटांना, जेव्हा [विशिष्ट घटना] घडली, तुम्ही [विशिष्ट कृती] निवडली. तुमचा विचार सांगा.'
        },
        question3: {
          focus: 'पुढील नियोजन',
          example: 'तुम्ही [मागील उत्तर] म्हणालात. [विशिष्ट क्षण] कसा गेला याचा विचार करून, पुढच्या वेळी काय वेगळं कराल?'
        }
      },
      culturalContext: 'भारतीय वर्गाच्या संदर्भात उदाहरणे द्या',
      codeSwitch: true
    }
  },

  // Telugu
  te: {
    code: 'te',
    name: 'తెలుగు',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'మీరు తరగతి పరిశీలన తర్వాత ఒక ఆలోచనాత్మక సంభాషణ చేస్తున్న అనుభవజ్ఞులైన మాస్టర్ టీచర్.',
      languageInstruction: 'ప్రశ్నను తెలుగులో రూపొందించండి. అవసరమైతే సాంకేతిక పదాలకు ఆంగ్లం వాడండి.',
      examples: {
        question1: {
          focus: 'ఉపాధ్యాయుని దృక్కోణంతో ప్రారంభించండి',
          example: 'మీరు [నిర్దిష్ట ప్రశ్న] అడిగినప్పుడు, విద్యార్థులు [నిర్దిష్ట స్పందన] ఇచ్చారని గమనించాను. ఆ క్షణంలో మీరు ఏమి సాధించాలనుకున్నారు?'
        },
        question2: {
          focus: 'ఒక బోధనా నిర్ణయాన్ని లోతుగా చూడండి',
          example: 'సుమారు [X] నిమిషానికి, [నిర్దిష్ట సంఘటన] జరిగినప్పుడు, మీరు [నిర్దిష్ట చర్య] ఎంచుకున్నారు. మీ ఆలోచన చెప్పండి.'
        },
        question3: {
          focus: 'ముందుకు చూడటం',
          example: 'మీరు [మునుపటి సమాధానం] అన్నారు. [నిర్దిష్ట క్షణం] ఎలా జరిగిందో ఆలోచించి, తదుపరి సారి ఏమి భిన్నంగా చేస్తారు?'
        }
      },
      culturalContext: 'భారతీయ తరగతి సందర్భంలో ఉదాహరణలు ఇవ్వండి',
      codeSwitch: true
    }
  },

  // Indian Tamil
  'ta-IN': {
    code: 'ta-IN',
    name: 'தமிழ்',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'நீங்கள் வகுப்பு நோட்டத்திற்குப் பிறகு ஒரு சிந்தனை உரையாடலை நடத்தும் அனுபவமிக்க தலைமை ஆசிரியர்.',
      languageInstruction: 'கேள்வியை தமிழில் உருவாக்குங்கள். தேவைப்பட்டால் தொழில்நுட்பச் சொற்களுக்கு ஆங்கிலம் பயன்படுத்துங்கள்.',
      examples: {
        question1: {
          focus: 'ஆசிரியரின் பார்வையில் தொடங்குங்கள்',
          example: 'நீங்கள் [குறிப்பிட்ட கேள்வி] கேட்டபோது, மாணவர்கள் [குறிப்பிட்ட பதில்] அளித்ததை கவனித்தேன். அந்த நேரத்தில் நீங்கள் எதை அடைய நினைத்தீர்கள்?'
        },
        question2: {
          focus: 'ஒரு கற்பித்தல் முடிவை ஆழமாக பாருங்கள்',
          example: 'சுமார் [X] நிமிடத்தில், [குறிப்பிட்ட நிகழ்வு] நடந்தபோது, நீங்கள் [குறிப்பிட்ட செயல்] தேர்ந்தெடுத்தீர்கள். உங்கள் சிந்தனையை சொல்லுங்கள்.'
        },
        question3: {
          focus: 'எதிர்காலத்தை நோக்கி',
          example: 'நீங்கள் [முந்தைய பதில்] சொன்னீர்கள். [குறிப்பிட்ட தருணம்] எப்படி நடந்தது என்று யோசித்து, அடுத்த முறை என்ன வித்தியாசமாக செய்வீர்கள்?'
        }
      },
      culturalContext: 'இந்திய வகுப்பறை சூழலில் எடுத்துக்காட்டுகள் தரவும்',
      codeSwitch: true
    }
  },

  // Kannada
  kn: {
    code: 'kn',
    name: 'ಕನ್ನಡ',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'ನೀವು ತರಗತಿ ವೀಕ್ಷಣೆಯ ನಂತರ ಚಿಂತನಶೀಲ ಸಂಭಾಷಣೆ ನಡೆಸುತ್ತಿರುವ ಅನುಭವಿ ಮಾಸ್ಟರ್ ಟೀಚರ್.',
      languageInstruction: 'ಪ್ರಶ್ನೆಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ರಚಿಸಿ. ಅಗತ್ಯವಿದ್ದರೆ ತಾಂತ್ರಿಕ ಪದಗಳಿಗೆ ಇಂಗ್ಲಿಷ್ ಬಳಸಿ.',
      examples: {
        question1: {
          focus: 'ಶಿಕ್ಷಕರ ದೃಷ್ಟಿಕೋನದಿಂದ ಆರಂಭಿಸಿ',
          example: 'ನೀವು [ನಿರ್ದಿಷ್ಟ ಪ್ರಶ್ನೆ] ಕೇಳಿದಾಗ, ವಿದ್ಯಾರ್ಥಿಗಳು [ನಿರ್ದಿಷ್ಟ ಪ್ರತಿಕ್ರಿಯೆ] ನೀಡಿದ್ದನ್ನು ಗಮನಿಸಿದೆ. ಆ ಕ್ಷಣದಲ್ಲಿ ನೀವು ಏನನ್ನು ಸಾಧಿಸಲು ಬಯಸಿದ್ದೀರಿ?'
        },
        question2: {
          focus: 'ಒಂದು ಬೋಧನಾ ನಿರ್ಧಾರವನ್ನು ಆಳವಾಗಿ ನೋಡಿ',
          example: 'ಸುಮಾರು [X] ನಿಮಿಷಕ್ಕೆ, [ನಿರ್ದಿಷ್ಟ ಘಟನೆ] ನಡೆದಾಗ, ನೀವು [ನಿರ್ದಿಷ್ಟ ಕ್ರಮ] ಆಯ್ಕೆ ಮಾಡಿದಿರಿ. ನಿಮ್ಮ ಆಲೋಚನೆಯನ್ನು ಹೇಳಿ.'
        },
        question3: {
          focus: 'ಮುಂದಿನ ಯೋಜನೆ',
          example: 'ನೀವು [ಹಿಂದಿನ ಉತ್ತರ] ಹೇಳಿದಿರಿ. [ನಿರ್ದಿಷ್ಟ ಕ್ಷಣ] ಹೇಗೆ ನಡೆಯಿತು ಎಂದು ಯೋಚಿಸಿ, ಮುಂದಿನ ಬಾರಿ ಏನನ್ನು ಬೇರೆ ರೀತಿಯಲ್ಲಿ ಮಾಡುತ್ತೀರಿ?'
        }
      },
      culturalContext: 'ಭಾರತೀಯ ತರಗತಿ ಸಂದರ್ಭದಲ್ಲಿ ಉದಾಹರಣೆಗಳನ್ನು ನೀಡಿ',
      codeSwitch: true
    }
  },

  // ─────────────────────────── FRANCOPHONE ───────────────────────────

  // French
  fr: {
    code: 'fr',
    name: 'Français',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'Vous êtes un enseignant expérimenté qui anime un entretien réflexif après une observation de classe.',
      languageInstruction: 'Rédigez la question en FRANÇAIS. Vous pouvez garder les termes techniques en anglais si besoin.',
      examples: {
        question1: {
          focus: "Partir du point de vue de l'enseignant",
          example: "J'ai remarqué qu'après votre question [question spécifique], les élèves ont répondu [réponse spécifique]. Qu'est-ce que vous vouliez obtenir à ce moment-là ?"
        },
        question2: {
          focus: "Creuser une décision pédagogique",
          example: "Vers la [X]e minute, au moment où [événement spécifique], vous avez choisi [action spécifique]. Qu'est-ce qui vous a amené à faire ce choix ?"
        },
        question3: {
          focus: "Se projeter vers la suite",
          example: "Vous avez évoqué [réponse précédente]. Avec le recul sur [moment spécifique], que feriez-vous autrement la prochaine fois ?"
        }
      },
      culturalContext: "Appuyez-vous sur des exemples proches du quotidien de sa classe",
      codeSwitch: true
    }
  }
};

/**
 * Get language configuration
 * @param {string} languageCode - Language code (en, ur, ar, es)
 * @returns {object} Language configuration object
 */
function getLanguageConfig(languageCode) {
  return LANGUAGE_CONFIG[languageCode] || LANGUAGE_CONFIG.en;
}

/**
 * Get all supported language codes
 * @returns {array} Array of language codes
 */
function getSupportedLanguages() {
  return Object.keys(LANGUAGE_CONFIG);
}

/**
 * Check if language is supported
 * @param {string} languageCode - Language code to check
 * @returns {boolean} True if language is supported
 */
function isLanguageSupported(languageCode) {
  return LANGUAGE_CONFIG.hasOwnProperty(languageCode);
}

module.exports = {
  LANGUAGE_CONFIG,
  getLanguageConfig,
  getSupportedLanguages,
  isLanguageSupported
};