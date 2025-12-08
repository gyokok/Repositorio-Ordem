/* eslint-disable indent */
/**
 * References and Codes of DND5e system:
 * https://github.com/foundryvtt/dnd5e/blob/a7f1404c7c38afa6d7dcc4f36a5fefd274034691/templates/chat/item-card.hbs
 * https://github.com/foundryvtt/dnd5e/blob/a7f1404c7c38afa6d7dcc4f36a5fefd274034691/module/documents/item.mjs#L1639
 */
/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class OrdemItem extends Item {
	/**
   * Augment the basic Item data model with additional dynamic data.
   */
	prepareData() {
		super.prepareData();
	}

	/**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
	async roll() {
		const item = this;
		const actor = this.actor;

		if (!actor) return;

		// Initialize chat data.
		const speaker = ChatMessage.getSpeaker({ actor: this.actor });
		const rollMode = game.settings.get('core', 'rollMode');
		const label = `[${item.type}] ${item.name}`;

		// Se for armamento, exibe o cartão de chat
		if (item.type === 'armament') {
            // LÓGICA DE TOKEN: Recupera o token e a cena para garantir que acharemos o ator depois
			const token = actor.token; // TokenDocument (se unlinked) ou null (se linked)
            const scene = token?.parent || game.scenes.current; // Cena do token ou cena atual

			const templateData = {
				actor: this.actor,
				tokenId: token ? token.id : null, // ID do Token
                sceneId: scene ? scene.id : null, // ID da Cena
				item: item,
				system: item.system,
				labels: item.labels,
				hasAttack: !!item.system.formulas.attack.formula,
				hasDamage: !!item.system.formulas.damage.formula
			};

			const html = await renderTemplate('systems/ordemparanormal/templates/chat/item-card.html', templateData);

			return ChatMessage.create({
				speaker: speaker,
				rollMode: rollMode,
				content: html,
				flags: { 
					ordemparanormal: { 
						cardType: "item",
						itemId: item.id 
					} 
				}
			});
		}
	}

    async rollAttack() {
        // Garante que o bonus exista (0 se undefined)
        const bonus = this.system.formulas.attack.bonus || 0;
        const formula = `${this.system.formulas.attack.formula} + ${bonus}`;
        
        const roll = new Roll(formula, this.actor.getRollData());
        await roll.evaluate(); 
        
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `Ataque: ${this.name}`
        });
    }

    async rollDamage() {
        const bonus = this.system.formulas.damage.bonus || 0;
        const formula = `${this.system.formulas.damage.formula} + ${bonus}`;
        const type = this.system.formulas.damage.type;
        
        const roll = new Roll(formula, this.actor.getRollData());
        await roll.evaluate();

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `Dano (${type}): ${this.name}`
        });
    }

	/* -------------------------------------------- */
	/* Chat Card Actions                           */
	/* -------------------------------------------- */

	static async chatListeners(html) {
		html.on('click', '.card-buttons button', this._onChatCardAction.bind(this));
	}

	static async _onChatCardAction(event) {
		event.preventDefault();

		// Extract card data
		const button = event.currentTarget;
		const card = button.closest('.chat-card');
		const messageId = card.closest('.message').dataset.messageId;
		const message = game.messages.get(messageId);
		const action = button.dataset.action;

		// Validate permission
		if (!message.isAuthor && !game.user.isGM) return;

		// --- CORREÇÃO: RECUPERAR ATOR (TOKEN vs GLOBAL) ---
		const actorId = card.dataset.actorId;
		const tokenId = card.dataset.tokenId;
        const sceneId = card.dataset.sceneId;
		const itemId = card.dataset.itemId;

		let actor;

        // 1. Tenta achar via Token na Cena Específica (Para Ameaças/Unlinked)
        if (tokenId && sceneId) {
            const scene = game.scenes.get(sceneId);
            const token = scene?.tokens.get(tokenId);
            if (token) actor = token.actor;
        }

        // 2. Tenta achar via Token na Cena Atual (Fallback)
		if (!actor && tokenId) {
			const token = canvas.tokens.get(tokenId);
			if (token) actor = token.actor;
		} 
        
        // 3. Tenta achar via ID Global (Para Personagens/Linked)
        if (!actor) actor = game.actors.get(actorId);

		if (!actor) return ui.notifications.error("Ator não encontrado. O token pode ter sido deletado ou a cena mudou.");
        // ----------------------------------------------------

		// Recover item
		const item = actor.items.get(itemId);

		if (!item) return ui.notifications.error(`Este item não existe mais no inventário de ${actor.name}.`);

		// Execute Action
		if (action === 'rollAttack') return item.rollAttack();
		else if (action === 'rollDamage') return item.rollDamage();
	}
}