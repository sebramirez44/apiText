// TODO: checar que al hacer el request solo pueda editar el usuario sus propias cosas.

import { PrismaClient } from "@prisma/client";
import express from "express";
import bcrypt from "bcrypt";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
const prisma = new PrismaClient();
const app = express();
dotenv.config();


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary, 
    //@ts-ignore
    padams : {
      folder: 'SintoCheck',
      allowedFormats: ['jpeg', 'png', 'jpg']
    }
    
})
const upload = multer({storage});



app.use(express.json());


function generateCode() {
  const charset = ' ';
  let retVal = '';
  for (let i = 0, n = charset.length; i < 6; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n)).toUpperCase();
  }
  return retVal;
}



// --- Authentication ---
function verifyToken(req: any, res: any, next: any) {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  jsonwebtoken.verify(
    token,
    process.env.JWT_SECRET ?? "ola",
    (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({ message: "Authentication failed" });
      }

      req.user = decoded;
      next();
    }
  );
}



app.post("/image", verifyToken, upload.single('image'), async (req, res) => {

  const {patientId} = req.body;
  //me sale un error que no existe path o filename, ver como agregar esos con ts si hay tiempo.
  //@ts-ignore
  const {path, filename} = req.file;
  //primero checar que exista el paciente antes de hacer lo siguiente

  //crear nueva imagen con path y filename en url y filename luego agregarlo al paciente
  console.log("pacienteId")
  console.log(patientId)
  //antes de hacer esto checar si ya existe una imagen para ese paciente
  //si existe borrarla y poner esta
  //codigo muy tonto, arreglar despues pero funciona
  const patientImage = await prisma.image.findFirst({
    where: {
      patientId: patientId,
    },
  });
  await prisma.image.deleteMany({});

  console.log("patientid de patientImage: ")
  console.log(patientImage?.patientId)
  if (patientImage === null) {
    const resultImage = await prisma.image.create({
      data: {
        filename,
        url: path,
        patient: {
          connect: { id: patientId }, 
        },
      },
    });
  } else {
    console.log("entro al else")
    console.log(patientImage.filename)
    const deleted = await cloudinary.uploader.destroy(patientImage.filename);
    console.log(deleted);
    const deleteImages = await prisma.image.deleteMany({
      where: {
        patientId: patientId,
      },
     });
     
    const resultImage = await prisma.image.create({
      data: {
        filename,
        url: path,
        patient: {
          connect: { id: patientId }, 
        },
      },
    });
  }
  console.log(path, filename)
  if (patientImage !== null) {
    // console.log(patientImage.url)
  }

  const responseData = {
    message: "ok"
  }
  res.json(responseData)
})

app.get('/image/:id', verifyToken, async (req, res) => {
  //obtener la imagen que tiene ese patientId
  //regresar el link a la imagen con ese patientId
  const {id} = req.params
  //obtener el patient de prisma
  const patientImage = await prisma.image.findFirst({
    where: {
      patientId: id,
    },
  });
  if (patientImage !== null) {
    const data = {
      url: patientImage.url
    }
    res.json(data)
    console.log("if")
  } else {
    res.json()
    console.log("else")
  }
  

})



// --- Account Management ---
app.post(`/signup/patient`, async (req, res) => {
  const {
    name,
    phone,
    password,
    birthdate,
    height,
    weight,
    medicine,
    medicalBackground,
  } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await prisma.patient.create({
    data: {
      name,
      phone,
      password: hashedPassword,
      birthdate,
      height,
      weight,
      medicine,
      medicalBackground,
    },
  });

  res.json(result);
});

app.post(`/signup/doctor`, async (req, res) => {
  const { name, phone, password, speciality, address } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);
  let foundDoctor = true
  
  
  //un problema es que en teoria podrian haber muchos requests al querer crear muchos doctores
  //pero como la probabilidad de eso es muy baja no me preocupa ahora
  let cont = 0;
  let code = ""
  while (foundDoctor === true && cont < 5) {
    code = generateCode()
    const doctor = await prisma.doctor.findFirst({
      where: {
        code: code,
      },
    });
    if (doctor === null) {
      foundDoctor = false
    }
    //contador para no hacer esta funcion muchas veces
    cont++
  }
  //creamos al nuevo doctor y lo retornamos.
  const result = await prisma.doctor.create({
    data: {
      name,
      phone,
      password: hashedPassword,
      code,
      speciality,
      address,
    },
  });

  res.json(result);
});


app.post(`/login/patient`, async (req, res) => {
  const { phone, password } = req.body;

  const result = await prisma.patient.findFirst({
    where: {
      phone,
    },
  });

  if (!result) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  const passwordMatch = await bcrypt.compare(password, result.password);

  if (!passwordMatch) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  const token = jsonwebtoken.sign(
    {
      id: result.id,
      name: result.name,
      phone: result.phone,
    },
    process.env.JWT_SECRET ?? "ola",
    { expiresIn: "14d" }
  );

  res.json({ ...result, token });
});

app.post(`/login/doctor`, async (req, res) => {
  const { phone, password } = req.body;

  const result = await prisma.doctor.findFirst({
    where: {
      phone,
    },
  });

  if (!result) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  const passwordMatch = await bcrypt.compare(password, result.password);

  if (!passwordMatch) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  const token = jsonwebtoken.sign(
    {
      id: result.id,
      name: result.name,
      phone: result.phone,
    },
    process.env.JWT_SECRET ?? "ola",
    { expiresIn: "1h" }
  );

  res.json({ ...result, token });
});

app.delete(`/patient/:id`, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.patient.delete({
    where: {
      id: id,
    },
  });
  

  res.json(result);
});

app.delete(`/doctor/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.doctor.delete({
    where: {
      id: id,
    },
  });

  res.json(result);
});

app.put(`/patient/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    phone,
    birthdate,
    height,
    weight,
    medicine,
    medicalBackground,
  } = req.body;

  const result = await prisma.patient.update({
    where: {
      id: id,
    },
    data: {
      name,
      phone,
      birthdate,
      height,
      weight,
      medicine,
      medicalBackground,
    },
  });

  res.json(result);
});

app.put(`/patientPassword/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await prisma.patient.update({
    where: {
      id: id,
    },
    data: {
      password: hashedPassword,
    },
  });

  res.json(result);
});

app.put(`/doctor/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;
  const { name, phone, speciality, address } = req.body;

  const result = await prisma.doctor.update({
    where: {
      id: id,
    },
    data: {
      name,
      phone,
      speciality,
      address,
    },
  });

  res.json(result);
});

// --- Health Data Lists ---
app.get(`/healthData`, verifyToken, async (req, res) => {
  const result = await prisma.healthData.findMany({
    where: {
      patientId: null,
    },
  });

  res.status(200).json(result);
  // res.json(result);
});

app.get(`/personalizedHealthData/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.healthData.findMany({
    where: {
      patientId: id,
    },
  });

  res.status(200).json(result);
});

app.get(`/trackedHealthData/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.healthDataRecord.findMany({
    where: {
      patientId: id,
      // Return only the records of the last 7 days
      createdAt: {
        gte: new Date(new Date().setDate(new Date().getDate() - 7)),
      },
    },
    select: {
      healthData: true,
    },
    distinct: ["healthDataId"],
  });

  res.json(result);
});

app.post(`/personalizedHealthData`, verifyToken, async (req, res) => {
  const { name, quantitative, patientId, rangeMin, rangeMax, unit } = req.body;

  const result = await prisma.healthData.create({
    data: {
      name,
      quantitative,
      patientId,
      rangeMin,
      rangeMax,
      unit,
    },
  });

  res.status(201).json(result);
});

app.put(`/personalizedHealthData/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;
  const { name, quantitative, rangeMin, rangeMax, unit } = req.body;

  const result = await prisma.healthData.update({
    where: {
      id: id,
    },
    data: {
      name,
      quantitative,
      rangeMin,
      rangeMax,
      unit,
    },
  });

  res.json(result);
});

app.delete(`/personalizedHealthData/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.healthData.delete({
    where: {
      id: id,
      patientId: {
        not: null,
      },
    },
  });

  res.json(result);
});

// --- Health Data Records ---

app.get(
  `/healthDataRecords/:patientId/:healthDataId`,
  verifyToken,
  async (req, res) => {
    const { patientId, healthDataId } = req.params;

    const result = await prisma.healthDataRecord.findMany({
      where: {
        patientId: patientId,
        healthDataId: healthDataId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json(result);
  }
);

app.post(`/healthDataRecord`, verifyToken, async (req, res) => {
  const { patientId, healthDataId, value, note } = req.body;

  const result = await prisma.healthDataRecord.create({
    data: {
      patientId,
      healthDataId,
      value,
      note,
    },
  });

  res.json(result);
});

app.put(`/healthDataRecord/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;
  const { value, note } = req.body;

  const result = await prisma.healthDataRecord.update({
    where: {
      id: id,
    },
    data: {
      value,
      note,
    },
  });

  res.json(result);
});

app.delete(`/healthDataRecord/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.healthDataRecord.delete({
    where: {
      id: id,
    },
  });

  res.json(result);
});

// --- Notes ---

app.get(`/notes/:patientId`, verifyToken, async (req, res) => {
  const { patientId } = req.params;

  const result = await prisma.note.findMany({
    where: {
      patientId: patientId,
    },
  });

  res.json(result);
});

app.post(`/note`, verifyToken, async (req, res) => {
  const { title, content, patientId } = req.body;

  const result = await prisma.note.create({
    data: {
      title,
      content,
      patientId,
    },
  });

  res.json(result);
});

app.put(`/note/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  const result = await prisma.note.update({
    where: {
      id: id,
    },
    data: {
      title,
      content,
    },
  });

  res.json(result);
});

app.delete(`/note/:id`, verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.note.delete({
    where: {
      id: id,
    },
  });

  res.json(result);
});

// --- Doctor Patient Relationship ---

app.get(
  `/doctorPatientRelationship/:patientId`,
  verifyToken,
  async (req, res) => {
    const { patientId } = req.params;

    const result = await prisma.doctor.findMany({
      where: {
        patients: {
          some: {
            id: patientId,
          },
        },
      },
    });

    res.json(result);
  }
);

app.post(`/doctorPatientRelationship`, verifyToken, async (req, res) => {
  const { doctorCode, patientId } = req.body;
  const doctor = await prisma.doctor.findFirst({
    where: {
      code: doctorCode,
    },
  });
  let doctorId = ""
  if (doctor !== null) {
    doctorId = doctor.id
  }
  const result = await prisma.doctor.update({
    where: {
      id: doctorId,
    },
    data: {
      patients: {
        connect: {
          id: patientId,
        },
      },
    },
  });

  res.json(result);
});

app.delete(`/doctorPatientRelationship`, verifyToken, async (req, res) => {
  const { doctorId, patientId } = req.body;

  const result = await prisma.doctor.update({
    where: {
      id: doctorId,
    },
    data: {
      patients: {
        disconnect: {
          id: patientId,
        },
      },
    },
  });

  res.json(result);
});

export default app;

app.listen(3000, () => {
  console.log(`Server is running on port ${3000}`);
});