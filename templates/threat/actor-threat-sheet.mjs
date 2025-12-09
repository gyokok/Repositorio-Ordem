/* eslint-disable new-cap */
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

/**
 * Ficha de Ameaça (V2) - Versão Estável
 * @extends {ActorSheetV2}
 */
export class OrdemThreatSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
	
    #dragDrop;

	constructor(options = {}) {
		super(options);
        // Inicializa Drag & Drop
        this.#dragDrop = this.#createDragDropHandlers();
        // Inicializa abas para evitar erro na abertura
        this.tabGroups = { primary: 'attacks' };
	}

	/** @inheritDoc */
	static get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
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
            
            // AÇÕES (Métodos Estáticos)
            actions: {
                onEditImage: OrdemThreatSheet._onEditImage,
                onRollAttributeTest: OrdemThreatSheet._onRollAttributeTest,
                onRollSkill: OrdemThreatSheet._onRollSkill,
                onRollMentalDamage: OrdemThreatSheet._onRollMentalDamage,
                
                createDoc: OrdemThreatSheet._onCreateDoc,
                viewDoc: OrdemThreatSheet._onViewDoc,
                deleteDoc: OrdemThreatSheet._onDeleteDoc,
                onRoll: OrdemThreatSheet._onRoll,
                
                onTab: OrdemThreatSheet._onTab,
                toggleDescription: OrdemThreatSheet._onToggleDescription
            }
        });
	}

    static TABS = {
        primary: {
            tabs: [
                { id: 'attacks', label: 'Ataques' },
                { id: 'abilities', label: 'Habilidades' },
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

        // Garante aba inicial
        if (!this.tabGroups?.primary) this.tabGroups = { primary: 'attacks' };

		foundry.utils.mergeObject(context, {
			system: this.document.system,
			actor: this.document,
			editable: this.isEditable,
			owner: this.document.isOwner,
			effects: prepareActiveEffectCategories(this.actor.allApplicableEffects()),
            optionDegree: CONFIG.op.dropdownDegree,
            tabs: this._getTabs(),
            activeTab: this.tabGroups.primary
		});

		this._prepareItems(context);
		this._prepareThreatSkills(context);
        
        context.enrichedAbilities = await TextEditor.enrichHTML(this.actor.system.temporary.abilities, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
		context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.details.description, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
		context.enrichedFearRiddle = await TextEditor.enrichHTML(this.actor.system.details.fearRiddle, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });
        context.enrichedActions = await TextEditor.enrichHTML(this.actor.system.temporary.actions, { secrets: this.document.isOwner, rollData: this.actor.getRollData(), relativeTo: this.actor });

		return context;
	}

    _getTabs() {
        const tabGroup = 'primary';
        const currentTab = this.tabGroups[tabGroup] || this.constructor.TABS[tabGroup].initial;
        
        return this.constructor.TABS[tabGroup].tabs.map(tabDef => {
            return {
                id: tabDef.id,
                label: tabDef.label,
                cssClass: currentTab === tabDef.id ? 'active' : '',
                group: tabGroup
            };
        });
    }

    _prepareItems(context) {
        const attacks = [];
        const abilities = [];

        for (const i of this.document.items) {
            i.img = i.img || DEFAULT_TOKEN;
            
            if (i.type === 'armament') {
                // Labels de Ataque
                const rangeType = i.system.types?.rangeType?.name;
                const itemBonus = i.system.formulas?.attack?.bonus;
                
                let attrKey = rangeType === 'ranged' ? 'dex' : 'str';
                let skillKey = rangeType === 'ranged' ? 'aim' : 'fighting';
                
                if (i.system.formulas?.attack?.attr) attrKey = i.system.formulas.attack.attr;
                if (i.system.formulas?.attack?.skill) skillKey = i.system.formulas.attack.skill;

                const attrValue = this.actor.system.attributes[attrKey]?.value || 0;
                const diceString = attrValue > 0 ? `${attrValue}d20` : `2d20kl1`;
                const skillLabel = game.i18n.localize(`op.skill.${skillKey}`) || skillKey;

                let attackLabel = `${diceString} + ${skillLabel}`;
                if (itemBonus && itemBonus != 0) attackLabel += ` + ${itemBonus}`;
                i.attackLabel = attackLabel;

                const dmgFormula = i.system.formulas?.damage?.formula || "0";
                const dmgTypeKey = i.system.formulas?.damage?.type;
                const dmgTypeLabel = dmgTypeKey ? game.i18n.localize(`op.damageTypeAbv.${dmgTypeKey}`) : "";
                i.damageLabel = `${dmgFormula} ${dmgTypeLabel}`;

                attacks.push(i);
            } 
            else if (i.type === 'ability') {
                // Custo e Labels
                const costVal = i.system.cost || "—";
                const costType = i.system.costType || "PE";
                i.displayCost = (costVal !== "—" && costVal !== "") ? `${costVal} ${costType}` : "—";
                
                if (i.system.activation) {
                    i.activationLabel = game.i18n.localize(`op.executionChoices.${i.system.activation}`);
                } else {
                    i.activationLabel = "—";
                }

                abilities.push(i);
            }
        }

        attacks.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        abilities.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        context.attacks = attacks;
        context.abilities = abilities;
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

    // Helper de Instância (Acessado pelos estáticos via 'this')
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
	/* Action Handlers (MÉTODOS ESTÁTICOS)          */
	/* -------------------------------------------- */

    static async _onTab(event, target) {
        event.preventDefault();
        const tab = target.dataset.tab;
        this.tabGroups.primary = tab;
        this.render();
    }

	static async _onEditImage(event, target) {
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

	static _onRollAttributeTest(event, target) {
		event.preventDefault();
		const attribute = target.dataset.key;
		this.actor.rollAttribute({ attribute, event });
	}

	static async _onRollSkill(event, target) {
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

    static async _onRollMentalDamage(event, target) {
        event.preventDefault();
        const formula = this.document.system.disturbingPresence.mentalDamage;
        if (!formula || formula.trim() === "") return ui.notifications.warn("Defina um valor para o Dano Mental.");
        try {
            const roll = new Roll(formula, this.actor.getRollData());
            await roll.toMessage({
                flavor: `Dano Mental (Presença Perturbadora)`,
                speaker: ChatMessage.getSpeaker({ actor: this.document })
            });
        } catch (err) {
            ui.notifications.error(`Erro: ${err.message}`);
        }
    }

	static async _onCreateDoc(event, target) {
        event.preventDefault();
		const docCls = getDocumentClass(target.dataset.documentClass);
		const docData = {
			name: docCls.defaultName({ type: target.dataset.type, parent: this.document }),
            type: target.dataset.type,
            system: {}
		};
		await docCls.create(docData, { parent: this.document });
	}

	static _onViewDoc(event, target) {
		const doc = this._getEmbeddedDocument(target);
		if (doc) doc.sheet.render(true);
	}

	static async _onDeleteDoc(event, target) {
		const doc = this._getEmbeddedDocument(target);
		if (doc) await doc.delete();
	}

	static async _onRoll(event, target) {
		event.preventDefault();
		const doc = this._getEmbeddedDocument(target);
		if (doc) return doc.roll();
	}

    static async _onToggleDescription(event, target) {
        const li = target.closest("li");
        const summary = li.querySelector(".item-summary");
        if (summary) {
            summary.remove();
        } else {
            const item = this._getEmbeddedDocument(li);
            if (!item) return;
            const div = document.createElement("div");
            div.classList.add("item-summary");
            div.style.flexBasis = "100%";
            div.style.padding = "5px 10px";
            div.style.fontSize = "0.9em";
            div.style.borderTop = "1px dashed #ccc";
            div.style.marginTop = "5px";
            div.innerHTML = await TextEditor.enrichHTML(item.system.description, {async: true});
            li.appendChild(div);
        }
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