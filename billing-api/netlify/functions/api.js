
const serverless = require("serverless-http");
const { app, connectDB } = require("../../server");

const handler = serverless(app);

exports.handler = async (event, context) => {
  try {
    await connectDB();
    return await handler(event, context);
  } catch (error) {
    console.error("Netlify API error:", error.message);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Backend request failed. Check server logs.",
      }),
    };
  }
};
