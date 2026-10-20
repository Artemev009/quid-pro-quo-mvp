CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
