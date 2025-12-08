/* eslint-disable new-cap */
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

/**
 * Ficha de Ameaça (V2) - Correção Final de Ações
 * @extends {ActorSheetV2}
 */
export class OrdemThreatSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
	
    #dragDrop;

	constructor(options = {}) {
		super(options);
        
        // Inicializa Drag & Drop
        this.#dragDrop = this.#createDragDropHandlers();

        // --- CORREÇÃO CRÍTICA: REGISTRO DE AÇÕES ---
        // Vinculamos manualmente cada função para garantir que seja reconhecida
        this.options.actions.onEditImage = this._onEditImage.bind(this);
        this.options.actions.onRollAttributeTest = this._onRollAttributeTest.bind(this);
        this.options.actions.onRollSkill = this._onRollSkill.bind(this);
        
        this.options.actions.createDoc = this._onCreateDoc.bind(this);
        this.options.actions.viewDoc = this._onViewDoc.bind(this);
        this.options.actions.deleteDoc = this._onDeleteDoc.bind(this);
        this.options.actions.onRoll = this._onRoll.bind(this);
		this.options.actions.onRollMentalDamage = this._onRollMentalDamage.bind(this); 
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
        dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
		actions: {} // As ações são populadas no construtor
	};

    static TABS = {
        primary: {
            tabs: [
                { id: 'attacks', label: 'Ataques' },
                { id: 'biography', label: 'Biografia' },
                { id: 'effects', label: 'Efeitos' }
            ],
            initial: 'attacks',
            labelPrefix: 'op.tab.'
        }
    };

	/** @inheritDoc */
	static PARTS = {
		sheet: { 
			id: 'sheet', 
			template: 'systems/ordemparanormal/templates/threat/actor-threat-sheet.hbs' 
		}
	};

    /** @override */
    _onRender(context, options) {
        this.#dragDrop.forEach((d) => d.bind(this.element));
    }

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		foundry.utils.mergeObject(context, {
			system: this.document.system,
			actor: this.document,
			editable: this.isEditable,
			owner: this.document.isOwner,
			effects: prepareActiveEffectCategories(this.actor.allApplicableEffects()),
            optionDegree: CONFIG.op.dropdownDegree,
            tabs: this._getTabs(options.parts)
		});

		this._prepareItems(context);
		this._prepareThreatSkills(context);

		context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.details.description, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
		context.enrichedFearRiddle = await TextEditor.enrichHTML(this.actor.system.details.fearRiddle, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
        context.enrichedActions = await TextEditor.enrichHTML(this.actor.system.temporary.actions, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
        context.enrichedAbilities = await TextEditor.enrichHTML(this.actor.system.temporary.abilities, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });

		return context;
	}

    _getTabs(parts) {
        const tabGroup = 'primary';
        if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = this.constructor.TABS[tabGroup].initial;
        return this.constructor.TABS[tabGroup].tabs.reduce((tabs, tabDef) => {
            tabs[tabDef.id] = {
                cssClass: this.tabGroups[tabGroup] === tabDef.id ? 'active' : '',
                group: tabGroup,
                id: tabDef.id,
                label: tabDef.label
            };
            return tabs;
        }, {});
    }

    _prepareItems(context) {
        const attacks = [];
        for (const i of this.document.items) {
            i.img = i.img || DEFAULT_TOKEN;
            if (i.type === 'armament') {
                attacks.push(i);
            }
        }
        attacks.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        context.attacks = attacks;
    }

	_prepareThreatSkills(context) {
		const s = this.document.system.skills || {};
		const buildSkill = (key, label, attr) => {
			const skillData = s[key] || {};
            const rawName = (key === 'freeSkill' && skillData.name) ? skillData.name : "";
			const displayLabel = (key === 'freeSkill' && skillData.name) ? skillData.name : label;
            const attrLabel = game.i18n.localize(`op.${attr}Abv`).toUpperCase();
			return {
				key: key,
				label: displayLabel,
                name: rawName,
				attr: attr,
                attrLabel: attrLabel,
				degreeLabel: skillData.degree?.label || 'untrained', 
				value: skillData.degree?.value || 0,
				isFree: key === 'freeSkill'
			};
		};
		context.threatSkills = [
			buildSkill('fighting', 'Luta', 'str'),
			buildSkill('aim', 'Pontaria', 'dex'),
			buildSkill('resilience', 'Fortitude', 'vit'),
			buildSkill('reflexes', 'Reflexo', 'dex'),
			buildSkill('will', 'Vontade', 'pre'),
			buildSkill('initiative', 'Iniciativa', 'dex'),
			buildSkill('perception', 'Percepção', 'pre'),
			buildSkill('freeSkill', 'Perícia Livre', 'int')
		];
	}

    /** Helper para recuperar documento */
	_getEmbeddedDocument(target) {
		const docRow = target.closest('li[data-document-class]');
        if (!docRow) return null;
		if (docRow.dataset.documentClass === 'Item') {
			return this.actor.items.get(docRow.dataset.itemId);
		} else if (docRow.dataset.documentClass === 'ActiveEffect') {
			return this.actor.effects.get(docRow.dataset.effectId);
		}
	}

	/* -------------------------------------------- */
	/* Action Handlers (MÉTODOS DE INSTÂNCIA)       */
	/* -------------------------------------------- */

	async _onEditImage(event, target) {
		const attr = target.dataset.edit;
		const current = foundry.utils.getProperty(this.document, attr);
		const { img } = this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ?? {};
		const fp = new FilePicker({
			current,
			type: 'image',
			redirectToRoot: img ? [img] : [],
			callback: (path) => this.document.update({ [attr]: path }),
			top: this.position.top + 40,
			left: this.position.left + 10,
		});
		return fp.browse();
	}

	_onRollAttributeTest(event, target) {
		event.preventDefault();
		const attribute = target.dataset.key;
		this.actor.rollAttribute({ attribute, event });
	}
	
	async _onRollMentalDamage(event, target) {
        event.preventDefault();
        
        // Recupera a fórmula do campo de dados
        const formula = this.document.system.disturbingPresence.mentalDamage;

        // Validação simples
        if (!formula || formula.trim() === "") {
            return ui.notifications.warn("Defina um valor ou fórmula para o Dano Mental (ex: 2d6).");
        }

        try {
            // Cria a rolagem
            const roll = new Roll(formula, this.actor.getRollData());
            
            // Envia para o chat
            await roll.toMessage({
                flavor: `Dano Mental (Presença Perturbadora)`,
                speaker: ChatMessage.getSpeaker({ actor: this.document })
            });
        } catch (err) {
            ui.notifications.error(`Erro na fórmula de dano mental: ${err.message}`);
        }
    }
	

	async _onRollSkill(event, target) {
		event.preventDefault();
		const skillKey = target.dataset.key;
		const attrKey = target.dataset.attr;
		const label = target.dataset.label;
		const skillData = this.document.system.skills[skillKey] || {};
		const skillValue = skillData.degree?.value || 0;
		const attrValue = this.document.system.attributes[attrKey]?.value || 0;
		const diceFormula = attrValue > 0 ? `${attrValue}d20kh1` : "2d20kl1";
		const formula = `${diceFormula} + ${skillValue}`;
		const roll = new Roll(formula);
		await roll.toMessage({
			flavor: `Teste de ${label} <span style="font-size: 0.8em; color: gray">(${attrKey.toUpperCase()})</span>`,
			speaker: ChatMessage.getSpeaker({ actor: this.document })
		});
	}

    // --- AÇÕES DE ITENS ---

	async _onCreateDoc(event, target) {
        event.preventDefault();
		const docCls = getDocumentClass(target.dataset.documentClass);
		const docData = {
			name: docCls.defaultName({ type: target.dataset.type, parent: this.document }),
            type: target.dataset.type,
            system: {}
		};
		await docCls.create(docData, { parent: this.document });
	}

	_onViewDoc(event, target) {
		const doc = this._getEmbeddedDocument(target);
		if (doc) doc.sheet.render(true);
	}

	async _onDeleteDoc(event, target) {
		const doc = this._getEmbeddedDocument(target);
		if (doc) await doc.delete();
	}

	async _onRoll(event, target) {
		event.preventDefault();
		const doc = this._getEmbeddedDocument(target);
		if (doc) return doc.roll();
	}

    /* -------------------------------------------- */
    /* Drag & Drop                                  */
    /* -------------------------------------------- */
    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
            d.permissions = { dragstart: this._canDragStart.bind(this), drop: this._canDragDrop.bind(this) };
            d.callbacks = { dragstart: this._onDragStart.bind(this), dragover: this._onDragOver.bind(this), drop: this._onDrop.bind(this) };
            return new DragDrop(d);
        });
    }

    _canDragStart(selector) { return this.isEditable; }
    _canDragDrop(selector) { return this.isEditable; }

    _onDragStart(event) {
        const docRow = event.currentTarget.closest('li');
        if ('link' in event.target.dataset) return;
        const item = this._getEmbeddedDocument(docRow);
        if (!item) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
    }

    _onDragOver(event) {}

    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event);
        if (!this.actor.isOwner) return false;
        if (data.type === 'Item') return this._onDropItem(event, data);
    }

    async _onDropItem(event, data) {
        const item = await Item.implementation.fromDropData(data);
        if (!item) return false;
        if (this.actor.uuid === item.parent?.uuid) return false;
        return this.actor.createEmbeddedDocuments('Item', [item]);
    }
}