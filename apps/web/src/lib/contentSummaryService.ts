import { translationService } from './translation';

interface MaterialSummary {
  content_id: string;
  summary_text: string;
  key_topics: string[];
  content_type: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  estimated_reading_time?: number;
  learning_objectives?: string[];
}

interface CourseSummaryData {
  course_name: string;
  course_description: string;
  material_summaries: MaterialSummary[];
  total_materials: number;
  content_types: string[];
}

class ContentSummaryService {
  private apiKey: string;

  constructor() {
    // Use OpenAI API key from environment
    this.apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
  }

  /**
   * Generate comprehensive summary for uploaded material
   */
  async generateMaterialSummary(
    contentText: string,
    contentType: string,
    title: string,
    description?: string
  ): Promise<MaterialSummary> {
    try {
      const prompt = `
Analyze the following educational material and provide a comprehensive summary:

Title: ${title}
Type: ${contentType}
Description: ${description || 'N/A'}

Content:
${contentText.substring(0, 4000)} ${contentText.length > 4000 ? '...[truncated]' : ''}

Please provide a JSON response with the following structure:
{
  "summary_text": "A comprehensive 2-3 paragraph summary of the material covering main concepts and key points",
  "key_topics": ["array", "of", "3-8", "main", "topics", "covered"],
  "difficulty_level": "beginner|intermediate|advanced",
  "estimated_reading_time": number_in_minutes,
  "learning_objectives": ["what", "students", "will", "learn", "from", "this", "material"]
}

Focus on educational value and make the summary useful for students trying to understand what this material contains.
`;

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
              content: 'You are an educational content analyzer. Provide detailed, accurate summaries of educational materials in JSON format only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const summaryResponse = data.choices[0]?.message?.content?.trim();

      if (!summaryResponse) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      let summaryData;
      try {
        summaryData = JSON.parse(summaryResponse);
      } catch (parseError) {
        console.error('Failed to parse OpenAI JSON response:', summaryResponse);
        // Fallback to basic summary
        summaryData = {
          summary_text: `This ${contentType} material titled "${title}" contains educational content. ${description || ''}`,
          key_topics: [title.toLowerCase()],
          difficulty_level: 'intermediate',
          estimated_reading_time: Math.ceil(contentText.length / 1000),
          learning_objectives: [`Understand concepts related to ${title}`]
        };
      }

      return {
        content_id: '', // Will be set when saving to database
        summary_text: summaryData.summary_text || `Summary of ${title}`,
        key_topics: Array.isArray(summaryData.key_topics) ? summaryData.key_topics : [title],
        content_type: contentType,
        difficulty_level: summaryData.difficulty_level || 'intermediate',
        estimated_reading_time: summaryData.estimated_reading_time || 5,
        learning_objectives: Array.isArray(summaryData.learning_objectives)
          ? summaryData.learning_objectives
          : [`Learn about ${title}`]
      };

    } catch (error) {
      console.error('Error generating material summary:', error);

      // Fallback summary generation
      return {
        content_id: '',
        summary_text: `This is a ${contentType} material titled "${title}". ${description || 'Educational content for course study.'}`,
        key_topics: [title.toLowerCase().replace(/[^a-zA-Z0-9\\s]/g, '').trim()],
        content_type: contentType,
        difficulty_level: 'intermediate',
        estimated_reading_time: Math.ceil(contentText.length / 1000) || 5,
        learning_objectives: [`Understand the concepts presented in ${title}`]
      };
    }
  }

  /**
   * Generate course overview from all material summaries
   */
  async generateCourseOverview(courseSummaryData: CourseSummaryData, language: 'en' | 'ta' = 'en'): Promise<string> {
    try {
      const materialsSummary = courseSummaryData.material_summaries
        .map(summary => `- ${summary.summary_text.substring(0, 200)}...`)
        .join('\\n');

      const allTopics = courseSummaryData.material_summaries
        .flatMap(summary => summary.key_topics)
        .filter((topic, index, arr) => arr.indexOf(topic) === index) // Remove duplicates
        .join(', ');

      const prompt = `
Create a comprehensive course overview based on the following information:

Course Name: ${courseSummaryData.course_name}
Course Description: ${courseSummaryData.course_description}
Total Materials: ${courseSummaryData.total_materials}
Content Types: ${courseSummaryData.content_types.join(', ')}

Key Topics Covered: ${allTopics}

Material Summaries:
${materialsSummary}

Please provide a friendly, comprehensive course overview that includes:
1. Course introduction and objectives
2. Main topics and areas of study
3. Types of materials available
4. What students will learn
5. How the content is structured

Make it sound natural and encouraging for students. Keep it 3-4 paragraphs.
${language === 'ta' ? 'Respond in Tamil language.' : ''}
`;

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
              content: language === 'ta'
                ? 'You are a helpful educational assistant. Create comprehensive course overviews in Tamil language that are friendly and encouraging for students.'
                : 'You are a helpful educational assistant. Create comprehensive course overviews that are friendly and encouraging for students.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 800,
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const overview = data.choices[0]?.message?.content?.trim();

      if (!overview) {
        throw new Error('Empty response from OpenAI');
      }

      return overview;

    } catch (error) {
      console.error('Error generating course overview:', error);

      // Fallback overview
      const fallbackOverview = `This ${courseSummaryData.course_name} course contains ${courseSummaryData.total_materials} study materials including ${courseSummaryData.content_types.join(', ')} resources. ${courseSummaryData.course_description || 'The course covers essential topics and provides comprehensive learning materials.'} Students will have access to various learning resources to build their knowledge and skills in this subject area.`;

      if (language === 'ta') {
        try {
          return await translationService.translateEnglishToTamil(fallbackOverview);
        } catch (translationError) {
          console.error('Translation fallback failed:', translationError);
          return fallbackOverview;
        }
      }

      return fallbackOverview;
    }
  }

  /**
   * Detect if a query is asking for course summary
   */
  detectCourseSummaryQuery(query: string, language: 'en' | 'ta' = 'en'): boolean {
    const englishPatterns = [
      /what is this course about/i,
      /tell me about this course/i,
      /course overview/i,
      /what will i learn/i,
      /course summary/i,
      /what's in this course/i,
      /course content/i,
      /course description/i,
      /what does this course cover/i,
      /course topics/i,
      /explain this course/i,
      /course information/i
    ];

    const tamilPatterns = [
      /இந்த பாடம் எதைப் பற்றியது/i,
      /இந்த பாடத்தில் என்ன/i,
      /பாட விவரம்/i,
      /பாட சுருக்கம்/i,
      /நான் என்ன கற்றுக்கொள்வேன்/i,
      /இந்த பாடத்தில் என்ன கற்றுக்கொள்ளலாம்/i,
      /பாட உள்ளடக்கம்/i,
      /பாட தலைப்புகள்/i
    ];

    const patterns = language === 'ta' ? tamilPatterns : englishPatterns;

    return patterns.some(pattern => pattern.test(query));
  }
}

export const contentSummaryService = new ContentSummaryService();
export type { MaterialSummary, CourseSummaryData };