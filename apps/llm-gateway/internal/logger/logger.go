package logger

import (
	"os"

	"github.com/joho/godotenv"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Log *zap.Logger

func Init() error {
	level := zap.NewAtomicLevel()
	_ = godotenv.Load(".env.dev")

	// Read LOG_LEVEL from environment (debug, info, warn, error)
	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "debug" // default for local dev
	}

	if err := level.UnmarshalText([]byte(logLevel)); err != nil {
		level.SetLevel(zapcore.DebugLevel)
	}

	cfg := zap.Config{
		Level:            level,
		Encoding:         "console", // human-readable with colors
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
		EncoderConfig: zapcore.EncoderConfig{
			MessageKey:    "msg",
			LevelKey:      "level",
			TimeKey:       "ts",
			NameKey:       "logger",
			CallerKey:     "caller",
			StacktraceKey: "stacktrace",

			EncodeLevel:    zapcore.CapitalColorLevelEncoder,
			EncodeTime:     zapcore.ISO8601TimeEncoder,
			EncodeDuration: zapcore.StringDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
	}

	l, err := cfg.Build()
	if err != nil {
		return err
	}

	Log = l
	return nil
}

func Sync() {
	if Log != nil {
		_ = Log.Sync()
	}
}
