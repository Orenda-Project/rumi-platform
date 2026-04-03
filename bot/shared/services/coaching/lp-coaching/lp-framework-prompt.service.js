/**
 * LP Framework Prompt Service
 *
 * Provides framework-specific instructions to append to LP generation
 * prompts. When a teacher generates a new lesson plan, the framework
 * they use for coaching informs the LP structure.
 *
 * Bead: bd-621 (Phase 1C-D)
 */

const FRAMEWORK_LP_INSTRUCTIONS = {
  oecd: `Structure this lesson plan to support formative assessment opportunities:
- Include 2-3 checkpoints where the teacher can gauge student understanding
- Add specific questions to ask at each checkpoint
- Include a brief plenary/exit ticket activity for summative assessment
- Ensure learning objectives are measurable and clearly stated`,

  hots: `Structure this lesson plan to promote Higher-Order Thinking Skills (Bloom's Taxonomy):
- Begin with lower-order recall activities, then scaffold to higher-order tasks
- Include at least 2 open-ended questions that require analysis or evaluation
- Add a creative/synthesis activity where students generate something new
- Include thinking routine prompts (e.g., "What makes you say that?", "How might this connect to...?")`,

  teach: `Structure this lesson plan to support collaborative and socio-emotional learning:
- Include at least one pair/group activity with clear collaborative roles
- Add autonomy moments where students can choose how to demonstrate learning
- Include explicit social-emotional language (encouragement, peer feedback)
- Plan a brief reflection activity where students assess their own effort`,

  fico: `Structure this lesson plan for fidelity and structured delivery:
- List each step with estimated time allocation (e.g., Step 1: Introduction - 5 min)
- Specify required materials for each step
- Include explicit transition instructions between activities
- Add monitoring checkpoints to verify students are on task
- Ensure the plan follows a clear sequence: Goal → Model → Practice → Apply → Assess`,
};

/**
 * Get framework-specific LP generation instructions.
 *
 * @param {string} frameworkKey - Framework key (oecd, hots, teach, fico)
 * @returns {string} Instructions to append to LP generation prompt, or empty string
 */
function getFrameworkLPInstructions(frameworkKey) {
  return FRAMEWORK_LP_INSTRUCTIONS[frameworkKey] || '';
}

module.exports = { getFrameworkLPInstructions };
