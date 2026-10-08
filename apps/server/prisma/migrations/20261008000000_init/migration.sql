-- pgvector is required by memories.embedding. The IVFFlat index stays in prisma/sql/ivfflat.sql.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "sides" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "sides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "climate" TEXT NOT NULL,
    "resources" JSONB NOT NULL,

    CONSTRAINT "biomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "races" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side_id" UUID NOT NULL,
    "biome_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "appearance" JSONB NOT NULL,
    "playable" BOOLEAN NOT NULL,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_stat_modifiers" (
    "race_id" UUID NOT NULL,
    "stat_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "race_stat_modifiers_pkey" PRIMARY KEY ("race_id","stat_id")
);

-- CreateTable
CREATE TABLE "race_languages" (
    "race_id" UUID NOT NULL,
    "language_id" UUID NOT NULL,
    "starting_upy" INTEGER NOT NULL,

    CONSTRAINT "race_languages_pkey" PRIMARY KEY ("race_id","language_id")
);

-- CreateTable
CREATE TABLE "stats" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "formula" TEXT NOT NULL,

    CONSTRAINT "stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "side_id" UUID,
    "description" TEXT NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "craft_skills" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "max_level" INTEGER NOT NULL,
    "station" TEXT NOT NULL,

    CONSTRAINT "craft_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "effect" JSONB NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "title_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_grades" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stat_count" INTEGER NOT NULL,
    "active_skills" INTEGER NOT NULL,
    "passive_skills" INTEGER NOT NULL,
    "min_value" INTEGER NOT NULL,
    "max_value" INTEGER NOT NULL,
    "coefficient" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "item_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "item_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_subtypes" (
    "id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slot" TEXT NOT NULL,

    CONSTRAINT "item_subtypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resist_stat" TEXT NOT NULL,

    CONSTRAINT "damage_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "effect" JSONB NOT NULL,
    "duration" INTEGER NOT NULL,
    "resist_stat" TEXT NOT NULL,

    CONSTRAINT "status_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "safe_zone" BOOLEAN NOT NULL,
    "has_portal" BOOLEAN NOT NULL,
    "has_bind" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "node_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edge_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_rooms" INTEGER NOT NULL,
    "max_rooms" INTEGER NOT NULL,

    CONSTRAINT "edge_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "default_duration" INTEGER NOT NULL,
    "parameters" JSONB NOT NULL,

    CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "biome_id" UUID,
    "effects" JSONB NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "duration_max" INTEGER NOT NULL,

    CONSTRAINT "weather_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "last_login" TIMESTAMPTZ(6),
    "banned" BOOLEAN NOT NULL,
    "ban_reason" TEXT,
    "ban_until" TIMESTAMPTZ(6),
    "role" TEXT NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "race_id" UUID NOT NULL,
    "controller" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "experience" BIGINT NOT NULL,
    "is_clean" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "last_played" TIMESTAMPTZ(6),
    "guild_id" UUID,
    "guild_rank" TEXT,
    "current_node" UUID,
    "bind_node" UUID,
    "hp_current" INTEGER NOT NULL,
    "od_current" DECIMAL(5,2) NOT NULL,
    "nn_current" INTEGER NOT NULL,
    "weight_current" DECIMAL(10,2) NOT NULL,
    "online" BOOLEAN NOT NULL,
    "appearance" JSONB NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_stats" (
    "character_id" UUID NOT NULL,
    "stat_id" UUID NOT NULL,
    "base_value" INTEGER NOT NULL,
    "racial_modifier" INTEGER NOT NULL,
    "final_value" INTEGER NOT NULL,
    "stat_points_spent" INTEGER NOT NULL,

    CONSTRAINT "character_stats_pkey" PRIMARY KEY ("character_id","stat_id")
);

-- CreateTable
CREATE TABLE "character_languages" (
    "character_id" UUID NOT NULL,
    "language_id" UUID NOT NULL,
    "upy" INTEGER NOT NULL,

    CONSTRAINT "character_languages_pkey" PRIMARY KEY ("character_id","language_id")
);

-- CreateTable
CREATE TABLE "character_skills" (
    "character_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "experience" INTEGER NOT NULL,

    CONSTRAINT "character_skills_pkey" PRIMARY KEY ("character_id","skill_id")
);

-- CreateTable
CREATE TABLE "character_titles" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "title_template_id" UUID NOT NULL,
    "guild_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "character_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_reputation_npc" (
    "character_id" UUID NOT NULL,
    "npc_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "character_reputation_npc_pkey" PRIMARY KEY ("character_id","npc_id")
);

-- CreateTable
CREATE TABLE "quests" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectives" JSONB NOT NULL,
    "rewards" JSONB NOT NULL,
    "level_req" INTEGER NOT NULL,
    "repeatable" BOOLEAN NOT NULL,
    "daily" BOOLEAN NOT NULL,
    "side_id" UUID,

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_progress" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "quest_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "progress" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quest_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_journal" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "entry" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "character_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type_id" UUID NOT NULL,
    "subtype_id" UUID NOT NULL,
    "base_stats" JSONB NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "requirements" JSONB NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "item_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "owner_id" UUID,
    "durability" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "grade_id" UUID NOT NULL,
    "stats" JSONB NOT NULL,
    "active_skills" JSONB NOT NULL,
    "passive_skills" JSONB NOT NULL,
    "sockets" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "equipped" BOOLEAN NOT NULL,
    "equipped_slot_id" UUID,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relics" (
    "item_id" UUID NOT NULL,
    "relic_type" TEXT NOT NULL,
    "subtype_id" UUID NOT NULL,
    "degradation" INTEGER NOT NULL,
    "feeding" JSONB NOT NULL,
    "mutation" JSONB NOT NULL,

    CONSTRAINT "relics_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "relic_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relic_type" TEXT NOT NULL,
    "subtype_id" UUID NOT NULL,
    "setup_time" INTEGER NOT NULL,
    "degradation_rate" DECIMAL(5,2) NOT NULL,
    "feeding_type" TEXT NOT NULL,
    "feeding_interval" INTEGER NOT NULL,
    "risks" JSONB NOT NULL,

    CONSTRAINT "relic_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echo_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "effect" JSONB NOT NULL,
    "nn_cost" INTEGER NOT NULL,
    "cooldown" INTEGER NOT NULL,
    "radius" INTEGER NOT NULL,

    CONSTRAINT "echo_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echoes" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "grade" INTEGER NOT NULL,
    "installed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "echoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "effect" JSONB NOT NULL,
    "nn_cost" INTEGER NOT NULL,
    "study_time" INTEGER NOT NULL,
    "cooldown" INTEGER NOT NULL,

    CONSTRAINT "path_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paths" (
    "character_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "grade" INTEGER NOT NULL,
    "learned_at" TIMESTAMPTZ(6) NOT NULL,
    "forgetting" INTEGER NOT NULL,
    "last_used" TIMESTAMPTZ(6),

    CONSTRAINT "paths_pkey" PRIMARY KEY ("character_id","template_id")
);

-- CreateTable
CREATE TABLE "core_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "skills" JSONB NOT NULL,
    "nn_cost" INTEGER NOT NULL,
    "requirements" JSONB NOT NULL,

    CONSTRAINT "core_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cores" (
    "item_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "grade" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "cores_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side_id" UUID NOT NULL,
    "biome_id" UUID NOT NULL,
    "level_min" INTEGER NOT NULL,
    "level_max" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type_id" UUID NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "owner_guild_id" UUID,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" UUID NOT NULL,
    "from_node" UUID NOT NULL,
    "to_node" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "length" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_nodes" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "resource_type_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "respawn_at" TIMESTAMPTZ(6),
    "owner_guild_id" UUID,
    "tax_rate" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,

    CONSTRAINT "resource_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_node_control" (
    "node_id" UUID NOT NULL,
    "guild_id" UUID NOT NULL,
    "flag_set_at" TIMESTAMPTZ(6) NOT NULL,
    "chest" JSONB NOT NULL,
    "tax_rate" INTEGER NOT NULL,

    CONSTRAINT "guild_node_control_pkey" PRIMARY KEY ("node_id")
);

-- CreateTable
CREATE TABLE "instances" (
    "id" UUID NOT NULL,
    "seed" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combats" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "winner" TEXT,

    CONSTRAINT "combats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_log" (
    "id" BIGSERIAL NOT NULL,
    "combat_id" UUID NOT NULL,
    "attacker_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "damage" INTEGER NOT NULL,
    "damage_type_id" UUID NOT NULL,
    "limb" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "damage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_effects" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "status_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "start_price" INTEGER NOT NULL,
    "buyout_price" INTEGER NOT NULL,
    "current_bid" INTEGER,
    "bidder_id" UUID,
    "city_node_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL,
    "initiator_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "offer" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_bank" (
    "guild_id" UUID NOT NULL,
    "gold" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "resources" JSONB NOT NULL,

    CONSTRAINT "guild_bank_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "storage" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "gold" INTEGER NOT NULL,
    "slots" INTEGER NOT NULL,

    CONSTRAINT "storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guilds" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "leader_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "doctrine" TEXT,
    "doctrine_changed_at" TIMESTAMPTZ(6),
    "tax_rate" INTEGER NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_members" (
    "guild_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "rank" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("guild_id","character_id")
);

-- CreateTable
CREATE TABLE "guild_wars" (
    "id" UUID NOT NULL,
    "attacker_id" UUID NOT NULL,
    "defender_id" UUID NOT NULL,
    "city_node_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "winner_id" UUID,
    "status" TEXT NOT NULL,

    CONSTRAINT "guild_wars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_diplomacy" (
    "id" UUID NOT NULL,
    "guild_a" UUID NOT NULL,
    "guild_b" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "guild_diplomacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" BIGSERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "sender_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "language_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "gold" INTEGER NOT NULL,
    "read" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "issuer_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "reward" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mutes" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "until" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npcs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "node_id" UUID NOT NULL,
    "functions" JSONB NOT NULL,
    "dialogues" JSONB NOT NULL,

    CONSTRAINT "npcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "character_id" UUID NOT NULL,
    "owner_account_id" UUID NOT NULL,
    "adapter_path" TEXT NOT NULL,
    "last_trained" TIMESTAMPTZ(6),
    "policy_version" TEXT NOT NULL,
    "llm_version" TEXT NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("character_id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "bot_id" UUID NOT NULL,
    "embedding" vector(768),
    "content" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_nodes" (
    "id" UUID NOT NULL,
    "bot_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "knowledge_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_edges" (
    "id" UUID NOT NULL,
    "from_node" UUID NOT NULL,
    "to_node" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "knowledge_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_logs" (
    "id" BIGSERIAL NOT NULL,
    "bot_id" UUID NOT NULL,
    "action" JSONB NOT NULL,
    "reward" DECIMAL(10,2) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_articles" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "side_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "rating" INTEGER NOT NULL,

    CONSTRAINT "wiki_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_versions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wiki_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_votes" (
    "article_id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "wiki_votes_pkey" PRIMARY KEY ("article_id","voter_id")
);

-- CreateTable
CREATE TABLE "world_events" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "world_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather" (
    "id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "weather_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "schema_version" INTEGER NOT NULL,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "biomes_side_id_idx" ON "biomes"("side_id");

-- CreateIndex
CREATE INDEX "races_side_id_idx" ON "races"("side_id");

-- CreateIndex
CREATE INDEX "races_biome_id_idx" ON "races"("biome_id");

-- CreateIndex
CREATE INDEX "languages_side_id_idx" ON "languages"("side_id");

-- CreateIndex
CREATE INDEX "item_subtypes_type_id_idx" ON "item_subtypes"("type_id");

-- CreateIndex
CREATE INDEX "weather_templates_biome_id_idx" ON "weather_templates"("biome_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "characters_name_key" ON "characters"("name");

-- CreateIndex
CREATE INDEX "characters_account_id_idx" ON "characters"("account_id");

-- CreateIndex
CREATE INDEX "characters_race_id_idx" ON "characters"("race_id");

-- CreateIndex
CREATE INDEX "characters_guild_id_idx" ON "characters"("guild_id");

-- CreateIndex
CREATE INDEX "characters_current_node_idx" ON "characters"("current_node");

-- CreateIndex
CREATE INDEX "characters_controller_idx" ON "characters"("controller");

-- CreateIndex
CREATE INDEX "character_titles_character_id_idx" ON "character_titles"("character_id");

-- CreateIndex
CREATE INDEX "character_titles_guild_id_idx" ON "character_titles"("guild_id");

-- CreateIndex
CREATE INDEX "quests_side_id_idx" ON "quests"("side_id");

-- CreateIndex
CREATE INDEX "quest_progress_character_id_idx" ON "quest_progress"("character_id");

-- CreateIndex
CREATE INDEX "quest_progress_quest_id_idx" ON "quest_progress"("quest_id");

-- CreateIndex
CREATE INDEX "character_journal_character_id_idx" ON "character_journal"("character_id");

-- CreateIndex
CREATE INDEX "item_templates_type_id_idx" ON "item_templates"("type_id");

-- CreateIndex
CREATE INDEX "item_templates_subtype_id_idx" ON "item_templates"("subtype_id");

-- CreateIndex
CREATE INDEX "items_template_id_idx" ON "items"("template_id");

-- CreateIndex
CREATE INDEX "items_owner_id_idx" ON "items"("owner_id");

-- CreateIndex
CREATE INDEX "items_grade_id_idx" ON "items"("grade_id");

-- CreateIndex
CREATE INDEX "inventory_character_id_idx" ON "inventory"("character_id");

-- CreateIndex
CREATE INDEX "inventory_item_id_idx" ON "inventory"("item_id");

-- CreateIndex
CREATE INDEX "relics_subtype_id_idx" ON "relics"("subtype_id");

-- CreateIndex
CREATE INDEX "relic_templates_subtype_id_idx" ON "relic_templates"("subtype_id");

-- CreateIndex
CREATE INDEX "echoes_item_id_idx" ON "echoes"("item_id");

-- CreateIndex
CREATE INDEX "echoes_template_id_idx" ON "echoes"("template_id");

-- CreateIndex
CREATE INDEX "cores_template_id_idx" ON "cores"("template_id");

-- CreateIndex
CREATE INDEX "regions_side_id_idx" ON "regions"("side_id");

-- CreateIndex
CREATE INDEX "regions_biome_id_idx" ON "regions"("biome_id");

-- CreateIndex
CREATE INDEX "nodes_region_id_idx" ON "nodes"("region_id");

-- CreateIndex
CREATE INDEX "nodes_type_id_idx" ON "nodes"("type_id");

-- CreateIndex
CREATE INDEX "nodes_owner_guild_id_idx" ON "nodes"("owner_guild_id");

-- CreateIndex
CREATE INDEX "edges_from_node_idx" ON "edges"("from_node");

-- CreateIndex
CREATE INDEX "edges_to_node_idx" ON "edges"("to_node");

-- CreateIndex
CREATE INDEX "edges_type_id_idx" ON "edges"("type_id");

-- CreateIndex
CREATE INDEX "resource_nodes_node_id_idx" ON "resource_nodes"("node_id");

-- CreateIndex
CREATE INDEX "resource_nodes_resource_type_id_idx" ON "resource_nodes"("resource_type_id");

-- CreateIndex
CREATE INDEX "resource_nodes_owner_guild_id_idx" ON "resource_nodes"("owner_guild_id");

-- CreateIndex
CREATE INDEX "guild_node_control_guild_id_idx" ON "guild_node_control"("guild_id");

-- CreateIndex
CREATE INDEX "combats_node_id_idx" ON "combats"("node_id");

-- CreateIndex
CREATE INDEX "damage_log_combat_id_idx" ON "damage_log"("combat_id");

-- CreateIndex
CREATE INDEX "damage_log_attacker_id_idx" ON "damage_log"("attacker_id");

-- CreateIndex
CREATE INDEX "damage_log_target_id_idx" ON "damage_log"("target_id");

-- CreateIndex
CREATE INDEX "status_effects_character_id_idx" ON "status_effects"("character_id");

-- CreateIndex
CREATE INDEX "status_effects_template_id_idx" ON "status_effects"("template_id");

-- CreateIndex
CREATE INDEX "status_effects_source_id_idx" ON "status_effects"("source_id");

-- CreateIndex
CREATE INDEX "auctions_seller_id_idx" ON "auctions"("seller_id");

-- CreateIndex
CREATE INDEX "auctions_item_id_idx" ON "auctions"("item_id");

-- CreateIndex
CREATE INDEX "auctions_city_node_id_idx" ON "auctions"("city_node_id");

-- CreateIndex
CREATE INDEX "auctions_expires_at_idx" ON "auctions"("expires_at");

-- CreateIndex
CREATE INDEX "trades_initiator_id_idx" ON "trades"("initiator_id");

-- CreateIndex
CREATE INDEX "trades_receiver_id_idx" ON "trades"("receiver_id");

-- CreateIndex
CREATE INDEX "storage_owner_id_idx" ON "storage"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_name_key" ON "guilds"("name");

-- CreateIndex
CREATE INDEX "guilds_leader_id_idx" ON "guilds"("leader_id");

-- CreateIndex
CREATE INDEX "guild_wars_attacker_id_idx" ON "guild_wars"("attacker_id");

-- CreateIndex
CREATE INDEX "guild_wars_defender_id_idx" ON "guild_wars"("defender_id");

-- CreateIndex
CREATE INDEX "guild_wars_city_node_id_idx" ON "guild_wars"("city_node_id");

-- CreateIndex
CREATE INDEX "guild_wars_winner_id_idx" ON "guild_wars"("winner_id");

-- CreateIndex
CREATE INDEX "guild_diplomacy_guild_a_idx" ON "guild_diplomacy"("guild_a");

-- CreateIndex
CREATE INDEX "guild_diplomacy_guild_b_idx" ON "guild_diplomacy"("guild_b");

-- CreateIndex
CREATE INDEX "chats_channel_idx" ON "chats"("channel");

-- CreateIndex
CREATE INDEX "chats_created_at_idx" ON "chats"("created_at");

-- CreateIndex
CREATE INDEX "chats_sender_id_idx" ON "chats"("sender_id");

-- CreateIndex
CREATE INDEX "mail_sender_id_idx" ON "mail"("sender_id");

-- CreateIndex
CREATE INDEX "mail_receiver_id_idx" ON "mail"("receiver_id");

-- CreateIndex
CREATE INDEX "contracts_issuer_id_idx" ON "contracts"("issuer_id");

-- CreateIndex
CREATE INDEX "contracts_target_id_idx" ON "contracts"("target_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "reports_target_id_idx" ON "reports"("target_id");

-- CreateIndex
CREATE INDEX "mutes_character_id_idx" ON "mutes"("character_id");

-- CreateIndex
CREATE INDEX "npcs_node_id_idx" ON "npcs"("node_id");

-- CreateIndex
CREATE INDEX "bots_owner_account_id_idx" ON "bots"("owner_account_id");

-- CreateIndex
CREATE INDEX "memories_bot_id_idx" ON "memories"("bot_id");

-- CreateIndex
CREATE INDEX "knowledge_nodes_bot_id_idx" ON "knowledge_nodes"("bot_id");

-- CreateIndex
CREATE INDEX "knowledge_edges_from_node_idx" ON "knowledge_edges"("from_node");

-- CreateIndex
CREATE INDEX "knowledge_edges_to_node_idx" ON "knowledge_edges"("to_node");

-- CreateIndex
CREATE INDEX "action_logs_bot_id_idx" ON "action_logs"("bot_id");

-- CreateIndex
CREATE INDEX "wiki_articles_author_id_idx" ON "wiki_articles"("author_id");

-- CreateIndex
CREATE INDEX "wiki_articles_side_id_idx" ON "wiki_articles"("side_id");

-- CreateIndex
CREATE INDEX "wiki_versions_article_id_idx" ON "wiki_versions"("article_id");

-- CreateIndex
CREATE INDEX "wiki_versions_author_id_idx" ON "wiki_versions"("author_id");

-- CreateIndex
CREATE INDEX "world_events_template_id_idx" ON "world_events"("template_id");

-- CreateIndex
CREATE INDEX "weather_region_id_idx" ON "weather"("region_id");

-- CreateIndex
CREATE INDEX "weather_template_id_idx" ON "weather"("template_id");

-- AddForeignKey
ALTER TABLE "biomes" ADD CONSTRAINT "biomes_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "sides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "races" ADD CONSTRAINT "races_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "sides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "races" ADD CONSTRAINT "races_biome_id_fkey" FOREIGN KEY ("biome_id") REFERENCES "biomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_stat_modifiers" ADD CONSTRAINT "race_stat_modifiers_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_stat_modifiers" ADD CONSTRAINT "race_stat_modifiers_stat_id_fkey" FOREIGN KEY ("stat_id") REFERENCES "stats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_languages" ADD CONSTRAINT "race_languages_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_languages" ADD CONSTRAINT "race_languages_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "sides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_subtypes" ADD CONSTRAINT "item_subtypes_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather_templates" ADD CONSTRAINT "weather_templates_biome_id_fkey" FOREIGN KEY ("biome_id") REFERENCES "biomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_current_node_fkey" FOREIGN KEY ("current_node") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_bind_node_fkey" FOREIGN KEY ("bind_node") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_stats" ADD CONSTRAINT "character_stats_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_stats" ADD CONSTRAINT "character_stats_stat_id_fkey" FOREIGN KEY ("stat_id") REFERENCES "stats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_languages" ADD CONSTRAINT "character_languages_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_languages" ADD CONSTRAINT "character_languages_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_skills" ADD CONSTRAINT "character_skills_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_skills" ADD CONSTRAINT "character_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "craft_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_titles" ADD CONSTRAINT "character_titles_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_titles" ADD CONSTRAINT "character_titles_title_template_id_fkey" FOREIGN KEY ("title_template_id") REFERENCES "title_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_titles" ADD CONSTRAINT "character_titles_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reputation_npc" ADD CONSTRAINT "character_reputation_npc_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reputation_npc" ADD CONSTRAINT "character_reputation_npc_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "npcs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "sides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_journal" ADD CONSTRAINT "character_journal_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_templates" ADD CONSTRAINT "item_templates_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_templates" ADD CONSTRAINT "item_templates_subtype_id_fkey" FOREIGN KEY ("subtype_id") REFERENCES "item_subtypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "item_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "item_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_equipped_slot_id_fkey" FOREIGN KEY ("equipped_slot_id") REFERENCES "item_subtypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relics" ADD CONSTRAINT "relics_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relics" ADD CONSTRAINT "relics_subtype_id_fkey" FOREIGN KEY ("subtype_id") REFERENCES "item_subtypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relic_templates" ADD CONSTRAINT "relic_templates_subtype_id_fkey" FOREIGN KEY ("subtype_id") REFERENCES "item_subtypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echoes" ADD CONSTRAINT "echoes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echoes" ADD CONSTRAINT "echoes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "echo_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paths" ADD CONSTRAINT "paths_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paths" ADD CONSTRAINT "paths_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "path_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cores" ADD CONSTRAINT "cores_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cores" ADD CONSTRAINT "cores_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "core_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "sides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_biome_id_fkey" FOREIGN KEY ("biome_id") REFERENCES "biomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "node_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_owner_guild_id_fkey" FOREIGN KEY ("owner_guild_id") REFERENCES "guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_node_fkey" FOREIGN KEY ("from_node") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_node_fkey" FOREIGN KEY ("to_node") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "edge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_nodes" ADD CONSTRAINT "resource_nodes_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_nodes" ADD CONSTRAINT "resource_nodes_resource_type_id_fkey" FOREIGN KEY ("resource_type_id") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_nodes" ADD CONSTRAINT "resource_nodes_owner_guild_id_fkey" FOREIGN KEY ("owner_guild_id") REFERENCES "guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_node_control" ADD CONSTRAINT "guild_node_control_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_node_control" ADD CONSTRAINT "guild_node_control_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combats" ADD CONSTRAINT "combats_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_log" ADD CONSTRAINT "damage_log_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "combats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_log" ADD CONSTRAINT "damage_log_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_log" ADD CONSTRAINT "damage_log_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_log" ADD CONSTRAINT "damage_log_damage_type_id_fkey" FOREIGN KEY ("damage_type_id") REFERENCES "damage_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_effects" ADD CONSTRAINT "status_effects_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_effects" ADD CONSTRAINT "status_effects_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "status_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_effects" ADD CONSTRAINT "status_effects_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_city_node_id_fkey" FOREIGN KEY ("city_node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_bank" ADD CONSTRAINT "guild_bank_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wars" ADD CONSTRAINT "guild_wars_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wars" ADD CONSTRAINT "guild_wars_defender_id_fkey" FOREIGN KEY ("defender_id") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wars" ADD CONSTRAINT "guild_wars_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_wars" ADD CONSTRAINT "guild_wars_city_node_id_fkey" FOREIGN KEY ("city_node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_diplomacy" ADD CONSTRAINT "guild_diplomacy_guild_a_fkey" FOREIGN KEY ("guild_a") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_diplomacy" ADD CONSTRAINT "guild_diplomacy_guild_b_fkey" FOREIGN KEY ("guild_b") REFERENCES "guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail" ADD CONSTRAINT "mail_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail" ADD CONSTRAINT "mail_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("character_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("character_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_from_node_fkey" FOREIGN KEY ("from_node") REFERENCES "knowledge_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_to_node_fkey" FOREIGN KEY ("to_node") REFERENCES "knowledge_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("character_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_articles" ADD CONSTRAINT "wiki_articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_articles" ADD CONSTRAINT "wiki_articles_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "sides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_versions" ADD CONSTRAINT "wiki_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "wiki_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_versions" ADD CONSTRAINT "wiki_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_votes" ADD CONSTRAINT "wiki_votes_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "wiki_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_votes" ADD CONSTRAINT "wiki_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "event_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather" ADD CONSTRAINT "weather_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather" ADD CONSTRAINT "weather_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "weather_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

