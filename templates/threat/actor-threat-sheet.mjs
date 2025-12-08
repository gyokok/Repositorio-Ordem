/* eslint-disable new-cap */
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

/**
 * Ficha de Ameaça atualizada para o padrão V2 (igual ao Agente).
 * @extends {ActorSheetV2}
 */
export class OrdemThreatSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
	
	constructor(options = {}) {
		super(options);
	}

	/** @inheritDoc */
	static DEFAULT_OPTIONS = {
		classes: ['ordemparanormal', 'sheet', 'actor', 'threat', 'themed', 'theme-light'],
		tag: 'form',
		position: {
			width: 600,
			height: 820
		},
		window: {
			resizable: true,
			title: 'Ficha de Ameaça'
		},
		form: {
			submitOnChange: true
		},
		actions: {
			onEditImage: this.#onEditImage,
			onRollAttributeTest: this.#onRollAttributeTest
		}
	};

	/** @inheritDoc */
	static PARTS = {
		// Definimos uma parte principal que contém todo o layout da ficha
		sheet: { 
			id: 'sheet', 
			template: 'systems/ordemparanormal/templates/threat/actor-threat-sheet.hbs' 
		}
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		// Preparar dados básicos
		foundry.utils.mergeObject(context, {
			system: this.document.system,
			actor: this.document,
			editable: this.isEditable,
			owner: this.document.isOwner,
			effects: prepareActiveEffectCategories(this.actor.allApplicableEffects())
		});

		// Enriquecer os editores de texto (ProseMirror)
		// Isso substitui o antigo {{editor}} e permite salvar corretamente
		context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.details.description, {
			secrets: this.document.isOwner,
			rollData: this.actor.getRollData(),
			relativeTo: this.actor
		});

		context.enrichedFearRiddle = await TextEditor.enrichHTML(this.actor.system.details.fearRiddle, {
			secrets: this.document.isOwner,
			rollData: this.actor.getRollData(),
			relativeTo: this.actor
		});

        // Enriquecer Ações e Habilidades (Temporary)
        context.enrichedActions = await TextEditor.enrichHTML(this.actor.system.temporary.actions, {
			secrets: this.document.isOwner,
			rollData: this.actor.getRollData(),
			relativeTo: this.actor
		});

        context.enrichedAbilities = await TextEditor.enrichHTML(this.actor.system.temporary.abilities, {
			secrets: this.document.isOwner,
			rollData: this.actor.getRollData(),
			relativeTo: this.actor
		});

		return context;
	}

	/**
	 * Ação para editar a imagem do token/ator
	 */
	static async #onEditImage(event, target) {
		const attr = target.dataset.edit;
		const current = foundry.utils.getProperty(this.document, attr);
		const { img } = this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ?? {};
		
		const fp = new FilePicker({
			current,
			type: 'image',
			redirectToRoot: img ? [img] : [],
			callback: (path) => {
				this.document.update({ [attr]: path });
			},
			top: this.position.top + 40,
			left: this.position.left + 10,
		});
		return fp.browse();
	}

	/**
	 * Ação para rolar atributos
	 */
	static #onRollAttributeTest(event, target) {
		event.preventDefault();
		const attribute = target.dataset.key;
		this.actor.rollAttribute({ attribute, event });
	}
}