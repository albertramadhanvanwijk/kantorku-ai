CREATE TABLE "creator_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(500),
	"file_asset_id" uuid,
	"metadata" jsonb,
	"classification" jsonb,
	"provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_driver" varchar(20) NOT NULL,
	"bucket" varchar(255),
	"key" varchar(500) NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_assets_checksum_unique" UNIQUE("checksum")
);
--> statement-breakpoint
CREATE TABLE "source_pack_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_pack_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_pack_items_pack_material_unique" UNIQUE("source_pack_id","material_id")
);
--> statement-breakpoint
CREATE TABLE "source_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(500) NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_materials" ADD CONSTRAINT "creator_materials_file_asset_id_file_assets_id_fk" FOREIGN KEY ("file_asset_id") REFERENCES "public"."file_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_pack_items" ADD CONSTRAINT "source_pack_items_source_pack_id_source_packs_id_fk" FOREIGN KEY ("source_pack_id") REFERENCES "public"."source_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_pack_items" ADD CONSTRAINT "source_pack_items_material_id_creator_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."creator_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_packs" ADD CONSTRAINT "source_packs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_materials_type_idx" ON "creator_materials" USING btree ("type");--> statement-breakpoint
CREATE INDEX "file_assets_checksum_idx" ON "file_assets" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "source_pack_items_pack_idx" ON "source_pack_items" USING btree ("source_pack_id");--> statement-breakpoint
CREATE INDEX "source_pack_items_material_idx" ON "source_pack_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "source_packs_created_by_idx" ON "source_packs" USING btree ("created_by");