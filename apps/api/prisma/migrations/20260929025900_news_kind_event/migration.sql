-- Solo el valor nuevo del enum: se agrega y se confirma antes de cualquier migración que lo use.
ALTER TYPE "NewsKind" ADD VALUE 'EVENT';
