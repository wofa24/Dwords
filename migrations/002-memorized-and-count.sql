--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

ALTER TABLE words ADD COLUMN memorized_at INTEGER;
ALTER TABLE words ADD COLUMN appear_count INTEGER NOT NULL DEFAULT 0;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

-- SQLite doesn't support DROP COLUMN easily, so we recreate the table
CREATE TABLE words_down (
    plan_id varchar(128) not null,
    word varchar(128),
    time integer not null,
    paraphrase text not null default '',
    show_paraphrase bool,
    color varchar(32),
    status integer not null default 0,
    version integer not null default 0,
    deleted boolean not null default false,
    primary key (plan_id, word)
);

INSERT INTO words_down SELECT plan_id, word, time, paraphrase, show_paraphrase, color, status, version, deleted FROM words;

DROP TABLE words;
ALTER TABLE words_down RENAME TO words;

CREATE INDEX words_plan_id ON words(plan_id);
