/**
 * AI Chat Endpoint - Grok-powered responses
 */

const express = require('express');
const router = express.Router();

// Grok API config
const XAI_API_KEY = process.env.XAI_API_KEY || '';
const XAI_MODEL = process.env.XAI_MODEL || 'grok-3-fast';

/**
 * POST /api/chat
 * Send a message and get an AI response
 */
router.post('/', async (req, res) => {
  try {
    const { message, context = {}, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build system prompt based on context
    const systemPrompt = buildSystemPrompt(context);
    
    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map(m => ({  // Last 6 messages for context
        role: m.role,
        content: m.text || m.content
      })),
      { role: 'user', content: message }
    ];

    // Call Grok API
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok API error:', error);
      throw new Error('AI service error');
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "I'm having trouble responding right now.";

    res.json({
      response: aiResponse,
      model: XAI_MODEL,
      usage: data.usage
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: error.message,
      response: "Sorry, I couldn't process that. Try asking about widgets or drilling data!"
    });
  }
});

/**
 * Build context-aware system prompt with widget/dashboard skills
 */
function buildSystemPrompt(context) {
  const { activeTab, userName, domain, entities, dashboardName } = context;
  
  let prompt = `You are the AI assistant for The Drilling Lab, an oil & gas drilling analytics platform.

## Your Personality
- Friendly, knowledgeable drilling industry expert
- Concise (under 100 words unless detail requested)
- Proactive in suggesting visualizations
- Professional but approachable

## Current Context`;

  if (userName) prompt += `\n- User: ${userName}`;
  if (activeTab) prompt += `\n- Current tab: ${activeTab}`;
  if (dashboardName) prompt += `\n- Dashboard: "${dashboardName}"`;
  if (domain) prompt += `\n- Topic detected: ${domain}`;
  if (entities?.rig) prompt += `\n- Rig mentioned: Rig ${entities.rig}`;

  prompt += `

## Widget Building Skills
You can help create these widget types:

**METRIC widgets** - Single KPI values:
- Active rigs count
- Total wells drilled  
- Average ROP (ft/hr)
- Current depth
- Days on well
- Mud weight (ppg)

**CHART widgets** - Visualizations:
- Line chart: ROP over time, depth progression
- Bar chart: Wells by rig, performance comparison
- Scatter plot: Days vs Depth curves
- Area chart: Cumulative metrics

**TABLE widgets** - Data grids:
- Active wells list
- Recent completions
- Rig inventory
- Drilling parameters

## Available Drilling Data
The platform has EDR (Electronic Drilling Recorder) data including:
- Bit depth, hole depth, block height
- ROP (Rate of Penetration)
- WOB (Weight on Bit)
- RPM, torque, pump pressure
- Mud flow in/out, mud weight
- Gas readings, pit volumes

## How to Respond to Widget Requests
When user wants a widget:
1. Confirm what they want to visualize
2. Suggest the best widget type
3. Ask about specifics (rig, time range, etc.)
4. Tell them you'll open the widget builder

Example responses:
- "Great idea! A metric showing active rigs would be perfect. I'll set that up for you."
- "For ROP trends, a line chart works best. Want to see all rigs or a specific one?"
- "I can create a table showing your wells. Should I include depth and ROP columns?"

## Navigation Help
- Home: Overview and setup checklist
- My Projects: Workspaces and project organization
- Dashboards: Custom widget layouts (where we are now!)
- My Files: Cloud storage browser
- Storage: Connect Google Drive/OneDrive
- My Brain: Personal context and preferences
- Historical Pipeline: Raw EDR data browser

## Response Style
- Be encouraging about their dashboard ideas
- Suggest relevant widgets based on context
- Use drilling terminology naturally
- Keep it conversational, not robotic
- One emoji max per response`;

  return prompt;
}

module.exports = router;
