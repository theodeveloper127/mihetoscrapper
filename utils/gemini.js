const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function generateText(prompt, options = {}) {
  const { model = 'gemini-2.5-flash-preview-05-20', generationConfig = {} } = options;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });
  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: generationConfig 
    });
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error during Gemini API call:", error);
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}

module.exports = {
  generateText
};
