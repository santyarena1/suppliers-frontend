-- La marca decide si su link público sirve para que un comercio o distro se vincule.
ALTER TABLE "BrandLanding" ADD COLUMN "allowPublicLink" BOOLEAN NOT NULL DEFAULT true;
