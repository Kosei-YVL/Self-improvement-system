CREATE TABLE `state_chunks` (
	`user_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`part` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `snapshot_id`, `part`)
);
--> statement-breakpoint
CREATE TABLE `user_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`snapshot_id` text NOT NULL,
	`previous_snapshot_id` text,
	`updated_at` text NOT NULL,
	`last_write_id` text NOT NULL
);
