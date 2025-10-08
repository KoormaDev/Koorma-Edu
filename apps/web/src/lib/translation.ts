import { Language } from '../data/translations';

interface TranslationResponse {
  translatedText: string;
  originalText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

class TranslationService {
  private apiKey: string;

  constructor() {
    // Use OpenAI API key from environment
    this.apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
  }

  async translateText(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResponse> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only respond with the translated text, no additional comments or explanations.`,
            },
            {
              role: 'user',
              content: text,
            },
          ],
          max_tokens: 1000,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`);
      }

      const data = await response.json();
      const translatedText = data.choices[0]?.message?.content?.trim() || text;

      return {
        translatedText,
        originalText: text,
        sourceLanguage,
        targetLanguage,
      };
    } catch (error) {
      console.error('Translation error:', error);
      // Fallback: return original text if translation fails
      return {
        translatedText: text,
        originalText: text,
        sourceLanguage,
        targetLanguage,
      };
    }
  }

  async translateTamilToEnglish(text: string): Promise<string> {
    const result = await this.translateText(text, 'Tamil', 'English');
    return result.translatedText;
  }

  async translateEnglishToTamil(text: string): Promise<string> {
    const result = await this.translateText(text, 'English', 'Tamil');
    return result.translatedText;
  }

  // Helper method to check if text contains Tamil characters
  containsTamil(text: string): boolean {
    const tamilRegex = /[\u0B80-\u0BFF]/;
    return tamilRegex.test(text);
  }

  // Helper method to check if text is primarily in Tamil
  isPrimarilyTamil(text: string): boolean {
    const tamilChars = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && (tamilChars / totalChars) > 0.3; // 30% threshold
  }
}

export const translationService = new TranslationService();
export type { TranslationResponse };